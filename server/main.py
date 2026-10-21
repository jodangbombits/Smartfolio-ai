import json
import logging
import os
import random
import string
import time
import urllib.error
import urllib.request
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
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
# TODO: ilipat sa .env at i-regenerate ang key bago i-push sa GitHub
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", os.environ.get("SUPABASE_SERVICE_KEY", "sb_publishable_9pL9sflzmQVmRzdIAlI6sw_mrwL1MEL"))

supabase: Optional[Client] = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        logging.error(f"Failed to initialize Supabase client: {e}")

otp_store = {}
verified_emails = {}

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

class StatusUpdateSchema(BaseModel):
    status: str
    rejection_reason: Optional[str] = ""
    remarks: Optional[str] = ""
    supervisor_comment: Optional[str] = ""

class MessagePayload(BaseModel):
    sender: str
    message: str

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
    moa_date_signed: Optional[str] = ""
    moa_valid_until: Optional[str] = ""
    moa_file_url: Optional[str] = ""
    moa_signed: Optional[bool] = False
    endorsement_letter: Optional[bool] = False
    parent_consent: Optional[bool] = False
    medical_clearance: Optional[bool] = False
    ratings: Optional[dict] = None

    class Config:
        extra = "allow"


# =====================================================================
# HELPER FUNCTIONS
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


PROFILE_ALIASES = {
    "moa_signed": "moaSigned",
    "moa_ref_no": "moaNumber",
    "moa_file_url": "moaFileUrl",
    "moa_valid_until": "moaValidUntil",
    "moa_date_signed": "moaDateSigned",
    "required_hours": "requiredHours",
    "endorsement_letter": "endorsementLetter",
    "parent_consent": "parentConsent",
    "medical_clearance": "medicalClearance",
    "host_company": "hostCompany",
    "year_level": "yearLevel",
}


def parse_profile_row(row: dict) -> dict:
    data_val = row.get("data")
    parsed = {}
    if isinstance(data_val, str):
        try:
            parsed = json.loads(data_val)
        except Exception:
            parsed = {}
    elif isinstance(data_val, dict):
        parsed = dict(data_val)
    parsed["user_id"] = row.get("user_id")
    return parsed


def normalize_profile(d: dict) -> dict:
    """Dagdagan ng camelCase aliases para gumana sa StudentDashboard."""
    out = dict(d)
    for snake, camel in PROFILE_ALIASES.items():
        if snake in out and camel not in out:
            out[camel] = out[snake]
    return out


@app.get("/")
async def health():
    return {"status": "ok", "service": "SmartFolio API Running Live!"}


# =====================================================================
# AUTH & OTP ENDPOINTS
# =====================================================================
@app.post("/api/send-otp")
async def send_otp(payload: OTPRequestSchema):
    recipient_email = payload.email.strip().lower()
    if not recipient_email:
        raise HTTPException(status_code=400, detail="Email is required")

    generated_otp = str(random.randint(100000, 999999))
    otp_store[recipient_email] = generated_otp

    html = f"<h2>SmartFolio OTP: {generated_otp}</h2>"
    try:
        await run_in_threadpool(send_email_sync, recipient_email, f"{generated_otp} is your verification code", html)
        return {"status": "success", "message": f"Code sent to {recipient_email}", "code": generated_otp}
    except Exception:
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
                "role": user.get("role", "student"),
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
                "role": user.get("role", "student"),
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

    html = f"<h2>SmartFolio Password Reset Code: {code}</h2>"
    if BREVO_API_KEY:
        try:
            await run_in_threadpool(send_email_sync, email, f"{code} is your SmartFolio reset code", html)
        except Exception:
            pass

    return {"status": "success", "message": f"Reset code sent to {email}", "code": code}


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
# UPLOAD ENDPOINT (proof ng student + MOA file ng supervisor)
# =====================================================================
@app.post("/api/upload")
async def upload_proof(file: UploadFile = File(...)):
    try:
        file_ext = os.path.splitext(file.filename)[1].lower()
        allowed_extensions = [".png", ".jpg", ".jpeg", ".jfif", ".webp", ".pdf"]

        if file_ext not in allowed_extensions:
            raise HTTPException(status_code=400, detail="Unsupported file format")

        safe_name = os.path.basename(file.filename).replace(" ", "_")
        filename = f"{int(time.time())}_{safe_name}"
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
    dtr_id = payload.get("dtr_id") or payload.get("id")

    log_date = str(payload.get("log_date") or payload.get("date") or "")
    time_in = str(payload.get("time_in") or payload.get("timeIn") or "")
    time_out = str(payload.get("time_out") or payload.get("timeOut") or "")
    raw_notes = str(payload.get("accomplishment") or payload.get("raw_notes") or payload.get("notes") or "")
    proof_url = str(payload.get("proof_url") or payload.get("proofUrl") or "")

    raw_hours = payload.get("rendered_today") or payload.get("renderedHours") or 8.0
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
        "accomplishment": raw_notes,
        "proof_url": proof_url,
        "status": "pending",
        "rejection_reason": "",
        "remarks": ""
    }

    try:
        if dtr_id:
            res = supabase.table("dtr_logs").update(new_log).eq("id", dtr_id).execute()
        else:
            res = supabase.table("dtr_logs").insert(new_log).execute()
        return {"message": "DTR saved successfully", "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/dtr/all")
@app.get("/api/dtr-logs")
async def get_all_dtr_logs(user_id: Optional[int] = None):
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client not configured")
    try:
        query = supabase.table("dtr_logs").select("*, users(full_name)").order("id", desc=True)
        if user_id:
            query = query.eq("user_id", user_id)

        res = query.execute()
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


@app.post("/api/dtr-logs/{log_id}/status")
@app.post("/api/dtr/{log_id}/status")
async def update_dtr_status(log_id: int, request: Request):
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client not configured")

    payload = await request.json()
    status_val = str(payload.get("status") or "pending").lower()
    if status_val not in ("pending", "approved", "rejected"):
        raise HTTPException(status_code=400, detail="Invalid status")

    reason = str(
        payload.get("rejection_reason")
        or payload.get("remarks")
        or payload.get("supervisor_comment")
        or ""
    )

    try:
        # 1. Update status lang muna sa dtr_logs table
        res = supabase.table("dtr_logs").update({"status": status_val}).eq("id", log_id).execute()

        # 2. Kapag may rejection message at naging rejected, mag-insert sa dtr_remarks table
        if reason and status_val == "rejected":
            try:
                supabase.table("dtr_remarks").insert({
                    "dtr_id": log_id,
                    "sender_name": "supervisor",
                    "sender_role": "supervisor",
                    "message": f"REJECTED: {reason}"
                }).execute()
            except Exception as remark_err:
                print("Failed to save to dtr_remarks:", str(remark_err))

        return {
            "status": "success",
            "updated_status": status_val,
            "rejection_reason": reason,
            "data": res.data
        }
    except Exception as e:
        print("UPDATE ERROR:", str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/dtr/{log_id}/messages")
async def add_dtr_message(log_id: int, payload: MessagePayload):
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client not configured")

    try:
        dtr = supabase.table("dtr_logs").select("messages").eq("id", log_id).single().execute()
        existing_messages = (dtr.data.get("messages") or []) if dtr.data else []

        new_msg = {
            "sender": payload.sender,
            "message": payload.message,
            "timestamp": datetime.now().strftime("%I:%M %p")
        }
        existing_messages.append(new_msg)

        supabase.table("dtr_logs").update({"messages": existing_messages}).eq("id", log_id).execute()
        return {"message": "Message sent", "messages": existing_messages}
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


# NOTE: dapat nasa itaas ito ng /api/interns/{user_id}/profile (okay na rin dito dahil magkaiba ang path)
@app.get("/api/interns/profiles")
async def get_all_intern_profiles():
    if not supabase:
        return {}
    try:
        res = supabase.table("intern_profiles").select("*").execute()
        return {str(r.get("user_id")): normalize_profile(parse_profile_row(r)) for r in (res.data or [])}
    except Exception as e:
        print("GET ALL PROFILES ERROR:", str(e))
        return {}


@app.get("/api/interns/{user_id}/profile")
async def get_intern_profile_by_id(user_id: int):
    if not supabase:
        return {}
    try:
        res = supabase.table("intern_profiles").select("*").eq("user_id", user_id).execute()
        if not res.data:
            return {}
        return normalize_profile(parse_profile_row(res.data[0]))
    except Exception as e:
        print("GET PROFILE ERROR:", str(e))
        return {}


@app.post("/api/interns/{user_id}/profile")
@app.put("/api/interns/{user_id}/profile")
async def save_intern_profile_by_id(user_id: int, payload: InternProfileSchema):
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client not configured")
    try:
        existing = supabase.table("intern_profiles").select("*").eq("user_id", user_id).execute()

        merged = {}
        if existing.data:
            merged = parse_profile_row(existing.data[0])

        incoming = payload.dict(exclude_unset=True)
        # tanggalin ang camelCase aliases para hindi mag-conflict sa snake_case
        for camel in PROFILE_ALIASES.values():
            incoming.pop(camel, None)
            merged.pop(camel, None)

        merged.update(incoming)
        merged["user_id"] = user_id
        json_str = json.dumps(merged, default=str)

        if existing.data:
            res = supabase.table("intern_profiles").update({"data": json_str}).eq("user_id", user_id).execute()
        else:
            res = supabase.table("intern_profiles").insert({"user_id": user_id, "data": json_str}).execute()

        return {"message": "Profile saved successfully", "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))