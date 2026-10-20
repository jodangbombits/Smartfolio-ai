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
    code = ''.join(random.choices(string.digits, k=6))
    otp_store[payload.email.lower()] = code
    return {"status": "success", "message": f"Reset code sent to {payload.email}", "code": code}


@app.post("/api/reset-password")
async def reset_password(payload: ResetSchema):
    stored_code = otp_store.get(payload.email.lower())
    if not stored_code or stored_code != payload.code.strip():
        raise HTTPException(status_code=400, detail="Mali o expired ang reset code!")

    if not supabase:
        raise HTTPException(status_code=500, detail="Database client not configured")

    try:
        supabase.table("users").update({"password": payload.new_password}).eq("email", payload.email.lower()).execute()
        del otp_store[payload.email.lower()]
        return {"status": "success", "message": "Password reset successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))