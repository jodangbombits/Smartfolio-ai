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
from datetime import datetime
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
class StatusUpdateSchema(BaseModel):
    status: str
    rejection_reason: Optional[str] = ""
    remarks: Optional[str] = ""
    supervisor_comment: Optional[str] = ""

class MessagePayload(BaseModel):
    sender: str
    message: str


@app.get("/")
async def health():
    return {"status": "ok", "service": "SmartFolio API Running Live!"}


# =====================================================================
# FILE UPLOAD ENDPOINT (.JFIF, .JPG, .PNG, .PDF SUPPORT)
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
# DTR ENDPOINTS (GUARANTEED STATUS & REJECTION REMARK FIX)
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
async def update_dtr_status(log_id: int, payload: StatusUpdateSchema):
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client not configured")
    
    reason = payload.rejection_reason or payload.remarks or payload.supervisor_comment or ""
    status = payload.status.lower()
    
    try:
        res = supabase.table("dtr_logs").update({
            "status": status,
            "rejection_reason": reason,
            "remarks": reason
        }).eq("id", log_id).execute()
        
        return {"message": "Status updated successfully", "status": status, "rejection_reason": reason, "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/dtr/{log_id}/messages")
async def add_dtr_message(log_id: int, payload: MessagePayload):
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client not configured")
        
    try:
        dtr = supabase.table("dtr_logs").select("messages").eq("id", log_id).single().execute()
        existing_messages = dtr.data.get("messages") or [] if dtr.data else []
        
        new_msg = {
            "sender": payload.sender,
            "message": payload.message,
            "timestamp": datetime.now().strftime("%I:%M %p")
        }
        existing_messages.append(new_msg)
        
        res = supabase.table("dtr_logs").update({"messages": existing_messages}).eq("id", log_id).execute()
        return {"message": "Message sent", "messages": existing_messages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/interns")
async def get_interns():
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client not configured")
    try:
        res = supabase.table("users").select("id, full_name, email, contact_number").eq("role", "student").execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))