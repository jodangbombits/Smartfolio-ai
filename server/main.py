import os
import random
import string
import logging
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from supabase import create_client, Client
import requests

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

supabase: Optional[Client] = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        logging.error(f"Failed to initialize Supabase client: {e}")

app = FastAPI(title="SmartFolio Hub AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

otp_store = {}

class LoginRequest(BaseModel):
    email: str
    password: str

class OTPRequest(BaseModel):
    email: str

class VerifyOTPRequest(BaseModel):
    email: str
    code: str

class RegisterRequest(BaseModel):
    full_name: str
    email: str
    contact_number: str
    password: str
    role: str
    invite_code: Optional[str] = ""

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    new_password: str

class GoogleLoginRequest(BaseModel):
    credential: str

@app.get("/")
def read_root():
    return {"message": "SmartFolio AI Backend is running live!"}

@app.post("/api/login")
def login(req: LoginRequest):
    if not supabase:
        raise HTTPException(status_code=500, detail="Database not configured")
    try:
        res = supabase.table("users").select("*").eq("email", req.email).execute()
        users = res.data
        if not users:
            raise HTTPException(status_code=400, detail="Mali ang Email o Password!")
        user = users[0]
        if user.get("password") != req.password:
            raise HTTPException(status_code=400, detail="Mali ang Email o Password!")
        return {"user": user}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/send-otp")
def send_otp(req: OTPRequest):
    code = ''.join(random.choices(string.digits, k=6))
    otp_store[req.email] = code
    return {"message": f"OTP sent to {req.email}", "code": code}

@app.post("/api/verify-otp")
def verify_otp(req: VerifyOTPRequest):
    stored_code = otp_store.get(req.email)
    if not stored_code or stored_code != req.code:
        raise HTTPException(status_code=400, detail="Mali o expired ang OTP code!")
    return {"message": "OTP verified successfully"}

@app.post("/api/register")
def register(req: RegisterRequest):
    if not supabase:
        raise HTTPException(status_code=500, detail="Database not configured")
    try:
        existing = supabase.table("users").select("*").eq("email", req.email).execute()
        if existing.data:
            raise HTTPException(status_code=400, detail="May account na gamit ang email na ito.")
        
        new_user = {
            "full_name": req.full_name,
            "email": req.email,
            "contact_number": req.contact_number,
            "password": req.password,
            "role": req.role
        }
        res = supabase.table("users").insert(new_user).execute()
        return {"message": "User registered successfully", "user": res.data[0] if res.data else new_user}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/forgot-password")
def forgot_password(req: ForgotPasswordRequest):
    code = ''.join(random.choices(string.digits, k=6))
    otp_store[req.email] = code
    return {"message": f"Reset code sent to {req.email}", "code": code}

@app.post("/api/reset-password")
def reset_password(req: ResetPasswordRequest):
    stored_code = otp_store.get(req.email)
    if not stored_code or stored_code != req.code:
        raise HTTPException(status_code=400, detail="Mali o expired ang reset code!")
    
    if not supabase:
        raise HTTPException(status_code=500, detail="Database not configured")
    try:
        res = supabase.table("users").update({"password": req.new_password}).eq("email", req.email).execute()
        if req.email in otp_store:
            del otp_store[req.email]
        return {"message": "Password reset successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/google-login")
def google_login(req: GoogleLoginRequest):
    try:
        resp = requests.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={req.credential}")
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Invalid Google token")
        
        token_info = resp.json()
        email = token_info.get("email")
        name = token_info.get("name", "Google User")
        
        if not email:
            raise HTTPException(status_code=400, detail="Email not provided by Google")
            
        if not supabase:
            return {"user": {"id": 1, "email": email, "full_name": name, "role": "student"}}
            
        res = supabase.table("users").select("*").eq("email", email).execute()
        if res.data:
            return {"user": res.data[0]}
        else:
            new_user = {
                "full_name": name,
                "email": email,
                "contact_number": "",
                "password": "GOOGLE_OAUTH_USER",
                "role": "student"
            }
            ins = supabase.table("users").insert(new_user).execute()
            return {"user": ins.data[0] if ins.data else new_user}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))