import hashlib
import hmac
import json
import logging
import mimetypes
import os
import random
import re
import secrets
import string
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Optional

from fastapi import FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

app = FastAPI(title="SmartFolio Hub AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],

)

# =====================================================================
# CONFIG & SUPABASE CLIENT INITIALIZATION
# =====================================================================
BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "jodangbombits@gmail.com")
SENDER_NAME = "SmartFolio OJT"

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", os.environ.get("SUPABASE_SERVICE_KEY", "sb_publishable_9pL9sflzmQVmRzdIAlI6sw_mrwL1MEL"))
SUPABASE_BUCKET = os.environ.get("SUPABASE_BUCKET", "proofs")

SUPERVISOR_INVITE_CODE = os.environ.get("SUPERVISOR_INVITE_CODE", "")

_google_raw = (
    os.environ.get("GOOGLE_CLIENT_ID")
    or os.environ.get("VITE_GOOGLE_CLIENT_ID")
    or os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
    or ""
)
GOOGLE_CLIENT_IDS = [x.strip() for x in _google_raw.split(",") if x.strip()]

supabase: Optional[Client] = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        logging.error(f"Failed to initialize Supabase client: {e}")

reset_store = {}
RESET_TTL_SECONDS = 10 * 60
MAX_UPLOAD_BYTES = 15 * 1024 * 1024

otp_store = {}
verified_emails = {}
VERIFIED_TTL_SECONDS = 15 * 60

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


# =====================================================================
# SCHEMAS
# =====================================================================
class RegisterSchema(BaseModel):
    full_name: str
    email: str
    contact_number: Optional[str] = ""
    password: str
    role: Optional[str] = "student"
    invite_code: Optional[str] = ""

class LoginSchema(BaseModel):
    email: str
    password: str

class StatusUpdateSchema(BaseModel):
    status: str
    rejection_reason: Optional[str] = ""

class RemarkSchema(BaseModel):
    sender_name: Optional[str] = None
    sender: Optional[str] = None
    sender_role: Optional[str] = None
    role: Optional[str] = None
    message: Optional[str] = None
    text: Optional[str] = None

class OTPRequestSchema(BaseModel):
    email: str

class OTPVerifySchema(BaseModel):
    email: str
    code: str

class GoogleLoginSchema(BaseModel):
    credential: str

class ForgotSchema(BaseModel):
    email: str

class ResetSchema(BaseModel):
    email: str
    code: str
    new_password: str


# =====================================================================
# EMAIL & HELPER FUNCTIONS
# =====================================================================
def send_email_sync(to_email: str, subject: str, html: str):
    if not BREVO_API_KEY:
        return
    body = json.dumps({
        "sender": {"name": SENDER_NAME, "email": SENDER_EMAIL},
        "to": [{"email": to_email}],
        "subject": subject,
        "htmlContent": html,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=body,
        method="POST",
        headers={
            "api-key": BREVO_API_KEY.strip(),
            "content-type": "application/json",
            "accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="ignore")
        raise Exception(f"Brevo {e.code}: {detail}")


@app.get("/")
async def health():
    return {"status": "ok", "service": "SmartFolio API Running Live!"}


# =====================================================================
# OTP & AUTH ENDPOINTS
# =====================================================================
@app.post("/api/send-otp")
async def send_otp(payload: OTPRequestSchema):
    recipient_email = payload.email.strip().lower()
    if not recipient_email:
        raise HTTPException(status_code=400, detail="Email is required")

    generated_otp = str(random.randint(100000, 999999))
    otp_store[recipient_email] = generated_otp

    print(f"=== OTP FOR {recipient_email}: {generated_otp} ===")

    html = f"<h2>SmartFolio OTP: {generated_otp}</h2>"
    try:
        await run_in_threadpool(send_email_sync, recipient_email, f"{generated_otp} is your verification code", html)
        return {"status": "success", "message": f"Code sent to {recipient_email}", "code": generated_otp}
    except Exception as e:
        return {"status": "success", "message": f"Generated OTP: {generated_otp}", "code": generated_otp}


@app.post("/api/verify-otp")
async def verify_otp(payload: OTPVerifySchema):
    email_key = payload.email.strip().lower()
    saved_code = otp_store.get(email_key)

    if not saved_code or saved_code != payload.code.strip():
        raise HTTPException(status_code=400, detail="Mali o expired ang OTP code!")

    del otp_store[email_key]
    verified_emails[email_key] = time.time()
    return {"status": "success", "message": "Email verified successfully"}


@app.post("/api/register")
async def register_user(payload: RegisterSchema):
    email = payload.email.strip().lower()
    role = (payload.role or "student").lower()

    if not supabase:
        raise HTTPException(status_code=500, detail="Database client not configured")

    try:
        existing = supabase.table("users").select("*").eq("email", email).execute()
        if existing.data:
            raise HTTPException(status_code=400, detail="Email is already registered")

        new_user = {
            "full_name": payload.full_name,
            "email": email,
            "contact_number": payload.contact_number,
            "password": payload.password,
            "role": role,
        }
        res = supabase.table("users").insert(new_user).execute()
        return {"message": "User registered successfully", "user": res.data[0] if res.data else new_user}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/login")
async def login_user(payload: LoginSchema):
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client not configured")

    email = payload.email.strip().lower()
    try:
        res = supabase.table("users").select("*").eq("email", email).execute()
        if not res.data:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        user = res.data[0]
        if user.get("password") != payload.password:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        return {
            "message": "Login successful",
            "user": {
                "id": user.get("id"),
                "name": user.get("full_name"),
                "full_name": user.get("full_name"),
                "email": user.get("email"),
                "role": user.get("role"),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/google-login")
async def google_login(payload: GoogleLoginSchema):
    try:
        url = f"https://oauth2.googleapis.com/tokeninfo?id_token={payload.credential}"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=15) as resp:
            info = json.loads(resp.read().decode("utf-8"))

        email = info.get("email", "").lower()
        name = info.get("name") or email.split("@")[0]

        if not email:
            raise HTTPException(status_code=400, detail="Email not provided by Google")

        if not supabase:
            return {"user": {"id": 1, "email": email, "full_name": name, "role": "student"}}

        res = supabase.table("users").select("*").eq("email", email).execute()
        if res.data:
            user = res.data[0]
        else:
            new_user = {
                "full_name": name,
                "email": email,
                "contact_number": "",
                "password": "GOOGLE_OAUTH_USER",
                "role": "student",
            }
            ins = supabase.table("users").insert(new_user).execute()
            user = ins.data[0] if ins.data else new_user

        return {
            "message": "Login successful",
            "user": {
                "id": user.get("id"),
                "name": user.get("full_name"),
                "full_name": user.get("full_name"),
                "email": user.get("email"),
                "role": user.get("role"),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Google login failed: {str(e)}")


@app.post("/api/forgot-password")
async def forgot_password(payload: ForgotSchema):
    email = payload.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    code = ''.join(random.choices(string.digits, k=6))
    otp_store[email] = code

    # Lalabas ang linyang ito sa Render logs para madaling makuha ang OTP
    print(f"=== RESET CODE FOR {email}: {code} ===")

    html = f"""
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>SmartFolio Password Reset</h2>
      <p>Ang iyong password reset code ay: <b>{code}</b></p>
      <p>Valid ito sa loob ng 10 minuto.</p>
    </div>
    """

    if BREVO_API_KEY:
        try:
            await run_in_threadpool(send_email_sync, email, f"{code} is your SmartFolio reset code", html)
            print(f"Successfully sent email to {email} via Brevo")
        except Exception as e:
            print(f"Failed to send email via Brevo: {e}")

    return {
        "status": "success",
        "message": f"Reset code sent to {email}",
        "code": code
    }


@app.post("/api/reset-password")
async def reset_password(payload: ResetSchema):
    email = payload.email.strip().lower()
    stored_code = otp_store.get(email)
    if not stored_code or stored_code != payload.code.strip():
        raise HTTPException(status_code=400, detail="Mali o expired ang reset code!")

    if not supabase:
        raise HTTPException(status_code=500, detail="Database client not configured")

    try:
        supabase.table("users").update({"password": payload.new_password}).eq("email", email).execute()
        del otp_store[email]
        return {"status": "success", "message": "Password reset successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/users")
async def get_all_users():
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client not configured")
    try:
        res = supabase.table("users").select("id, full_name, email, contact_number, role").execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================================
# FILE UPLOAD ENDPOINT (ADDED FOR PROOF FILES & .JFIF SUPPORT)
# =====================================================================
@app.post("/api/upload")
async def upload_proof(file: UploadFile = File(...)):
    try:
        file_ext = os.path.splitext(file.filename)[1].lower()
        allowed_extensions = [".png", ".jpg", ".jpeg", ".jfif", ".webp", ".pdf"]
        
        if file_ext not in allowed_extensions:
            raise HTTPException(status_code=400, detail="Unsupported file format")

        filename = f"{int(time.time())}_{file.filename}"
        file_path = os.path.join(UPLOAD_DIR, filename)

        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)

        file_url = f"/uploads/{filename}"
        return {"message": "File uploaded successfully", "proof_url": file_url, "url": file_url}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


# =====================================================================
# DTR ENDPOINTS
# =====================================================================
@app.post("/api/dtr/submit")
async def submit_dtr(request: Request):
    payload = await request.json()
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client not configured")

    user_id = payload.get("user_id") or payload.get("userId")
    if not user_id:
        raise HTTPException(status_code=400, detail="Missing user_id")

    log_date = str(payload.get("log_date") or payload.get("date") or "")
    time_in = str(payload.get("time_in") or payload.get("timeIn") or "")
    time_out = str(payload.get("time_out") or payload.get("timeOut") or "")
    raw_notes = str(payload.get("raw_notes") or payload.get("notes") or payload.get("accomplishments") or "")
    proof_url = str(payload.get("proof_url") or payload.get("proofUrl") or payload.get("proof") or "")
    
    raw_hours = payload.get("rendered_today") or payload.get("renderedHours") or payload.get("hoursRendered") or 8.0
    try:
        rendered_today = float(raw_hours)
    except (ValueError, TypeError):
        rendered_today = 8.0

    new_log = {
        "user_id": user_id,
        "log_date": log_date,
        "time_in": time_in,
        "time_out": time_out,
        "rendered_today": rendered_today,
        "raw_notes": raw_notes,
        "proof_url": proof_url,
        "status": "pending",
    }
    try:
        res = supabase.table("dtr_logs").insert(new_log).execute()
        return {"message": "DTR saved successfully", "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/dtr/all")
async def get_all_dtr_logs():
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client not configured")
    try:
        res = supabase.table("dtr_logs").select("*, users(full_name)").order("id", desc=True).execute()
        logs = []
        for r in res.data or []:
            student_name = r.get("users", {}).get("full_name") if isinstance(r.get("users"), dict) else None
            r["student_name"] = student_name or "Unknown Student"
            logs.append(r)
        return logs
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/dtr/{user_id}")
async def get_dtr_logs(user_id: int):
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client not configured")
    try:
        res = supabase.table("dtr_logs").select("*").eq("user_id", user_id).order("id", desc=True).execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================================
# INTERN PROFILES ENDPOINTS
# =====================================================================
@app.get("/api/interns")
async def get_interns():
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client not configured")
    try:
        res = supabase.table("users").select("id, full_name, email, contact_number").eq("role", "student").execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

        # =====================================================================
# INTERN PROFILE SAVE & FETCH ENDPOINTS (FOR SUPERVISOR & STUDENT)
# =====================================================================
class InternProfileSchema(BaseModel):
    user_id: Optional[int] = None
    email: Optional[str] = None
    school: Optional[str] = ""
    course: Optional[str] = ""
    year_level: Optional[str] = ""
    adviser: Optional[str] = ""
    contact: Optional[str] = ""
    host_company: Optional[str] = ""
    department: Optional[str] = ""
    start_date: Optional[str] = ""
    end_date: Optional[str] = ""
    required_hours: Optional[int] = 500
    moa_ref_no: Optional[str] = ""
    moa_signed: Optional[bool] = False
    endorsement_letter: Optional[bool] = False
    parent_consent: Optional[bool] = False
    medical_clearance: Optional[bool] = False


@app.post("/api/intern-profile/save")
async def save_intern_profile(payload: InternProfileSchema):
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client not configured")
    try:
        data = payload.dict(exclude_unset=True)
        query = supabase.table("intern_profiles").select("*")
        if payload.user_id:
            query = query.eq("user_id", payload.user_id)
        elif payload.email:
            query = query.eq("email", payload.email)

        existing = query.execute()

        if existing.data:
            res = (
                supabase.table("intern_profiles")
                .update(data)
                .eq("id", existing.data[0]["id"])
                .execute()
            )
        else:
            res = supabase.table("intern_profiles").insert(data).execute()

        return {"message": "Profile saved successfully", "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/intern-profile/{identifier}")
async def get_intern_profile(identifier: str):
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client not configured")
    try:
        if identifier.isdigit():
            res = (
                supabase.table("intern_profiles")
                .select("*")
                .eq("user_id", int(identifier))
                .execute()
            )
        else:
            res = (
                supabase.table("intern_profiles")
                .select("*")
                .eq("email", identifier.lower())
                .execute()
            )

        return res.data[0] if res.data else {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))