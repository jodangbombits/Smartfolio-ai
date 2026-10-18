import json
import os
import random
import shutil
import urllib.request
import urllib.error
import uuid
from typing import List, Optional

import psycopg2
import psycopg2.extras
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- BREVO EMAIL (HTTPS API) CONFIGURATION ---
BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "jodangbombits@gmail.com")
SENDER_NAME = "SmartFolio OJT"

# --- DATABASE (Supabase Postgres) ---
DATABASE_URL = os.environ.get("DATABASE_URL", "")

# In-memory OTP storage for registration validation (email -> otp_code)
otp_store = {}

# NOTE: nabubura pa rin ito sa Render free plan (ilipat sa Supabase Storage sa susunod)
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


def get_conn():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set")
    return psycopg2.connect(DATABASE_URL)


def send_email_sync(to_email: str, subject: str, html: str):
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


# --- DATABASE INITIALIZATION ---
def init_db():
    conn = get_conn()
    cur = conn.cursor()

    # 1. Users Table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            full_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            contact_number TEXT,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'student'
        )
    """)

    # 2. DTR Logs Table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS dtr_logs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users (id),
            log_date TEXT NOT NULL,
            time_in TEXT NOT NULL,
            time_out TEXT NOT NULL,
            rendered_today REAL NOT NULL,
            raw_notes TEXT,
            proof_url TEXT,
            status TEXT DEFAULT 'pending',
            rejection_reason TEXT DEFAULT ''
        )
    """)

    # 3. DTR Remarks / Discussion Table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS dtr_remarks (
            id SERIAL PRIMARY KEY,
            dtr_id INTEGER NOT NULL REFERENCES dtr_logs (id),
            sender_name TEXT NOT NULL,
            sender_role TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 4. Intern Profiles Table (profile + MOA + requirements ng bawat student, naka-JSON)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS intern_profiles (
            user_id INTEGER PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()
    cur.close()
    conn.close()


init_db()


# --- PYDANTIC SCHEMAS ---
class RegisterSchema(BaseModel):
    full_name: str
    email: str
    contact_number: Optional[str] = ""
    password: str
    role: Optional[str] = "student"


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
    timestamp: Optional[str] = None


class OTPRequestSchema(BaseModel):
    email: str


class OTPVerifySchema(BaseModel):
    email: str
    code: str


# HELPER FUNCTION: Fetch nested messages for a DTR entry
def get_messages_for_dtr(dtr_id: int):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT id, dtr_id, sender_name, sender_role, message, created_at"
        " FROM dtr_remarks WHERE dtr_id = %s ORDER BY id ASC",
        (dtr_id,),
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()

    messages = []
    for r in rows:
        sender_role = (r["sender_role"] or "").lower()
        sender_type = "supervisor" if "supervisor" in sender_role else "student"
        created = r["created_at"]
        messages.append({
            "id": r["id"],
            "dtr_id": r["dtr_id"],
            "sender": sender_type,
            "sender_name": r["sender_name"],
            "sender_role": r["sender_role"],
            "message": r["message"],
            "text": r["message"],
            "timestamp": str(created) if created is not None else None,
        })
    return messages


# --- OTP: SEND (Brevo HTTPS API, real-time) ---
@app.post("/api/send-otp")
async def send_otp(payload: OTPRequestSchema):
    recipient_email = payload.email.strip()
    if not recipient_email:
        raise HTTPException(status_code=400, detail="Email is required")

    generated_otp = str(random.randint(100000, 999999))
    otp_store[recipient_email.lower()] = generated_otp

    html = f"""
    <div style="font-family: Arial, sans-serif; background-color: #071322; color: #e2e8f0; padding: 30px;">
      <div style="max-width: 440px; margin: auto; background: #0f172a; border: 1px solid #22d3ee; border-radius: 16px; padding: 25px; text-align: center;">
        <h2 style="color: #22d3ee;">&#9889; SmartFolio Verification</h2>
        <p style="color: #94a3b8;">Ang iyong verification code:</p>
        <div style="background: #1e293b; border: 2px dashed #22d3ee; border-radius: 10px; padding: 15px; font-size: 32px; font-weight: 800; color: #38bdf8; letter-spacing: 8px; margin: 20px 0;">
          {generated_otp}
        </div>
        <p style="color: #64748b; font-size: 12px;">Huwag ibahagi ang code na ito kanino man.</p>
      </div>
    </div>
  """

    try:
        await run_in_threadpool(
            send_email_sync,
            recipient_email,
            f"{generated_otp} is your SmartFolio verification code",
            html,
        )
        return {
            "status": "success",
            "message": f"Verification code sent to {recipient_email}",
        }
    except Exception as e:
        print(f"Email Error: {str(e)}")
        msg = str(e)
        if "401" in msg or "Key not found" in msg:
            msg = "Mali ang Brevo API key sa main.py"
        elif "sender" in msg.lower():
            msg = "Hindi pa verified ang SENDER_EMAIL sa Brevo (Senders & IP)"
        elif "timed out" in msg or "getaddrinfo" in msg:
            msg = "Walang koneksyon (subukan ang ibang WiFi/hotspot)"
        raise HTTPException(
            status_code=500, detail=f"Failed to send email: {msg}"
        )


# --- OTP: VERIFY ---
@app.post("/api/verify-otp")
async def verify_otp(payload: OTPVerifySchema):
    email_key = payload.email.strip().lower()
    saved_code = otp_store.get(email_key)

    if not saved_code:
        raise HTTPException(
            status_code=400,
            detail="Walang nahanap na OTP request. Mag-click ng resend.",
        )

    if saved_code == payload.code.strip():
        del otp_store[email_key]
        return {"status": "success", "message": "Email verified successfully"}
    else:
        raise HTTPException(
            status_code=400, detail="Mali ang Verification Code! Pakisuri ulit."
        )


# --- 1. REGISTER ENDPOINT ---
@app.post("/api/register")
async def register_user(payload: RegisterSchema):
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO users (full_name, email, contact_number, password, role)"
            " VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (
                payload.full_name,
                payload.email.strip().lower(),
                payload.contact_number,
                payload.password,
                payload.role.lower(),
            ),
        )
        user_id = cur.fetchone()[0]
        conn.commit()
        return {"message": "User registered successfully", "user_id": user_id}
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(status_code=400, detail="Email already registered")
    finally:
        cur.close()
        conn.close()


# --- 2. LOGIN ENDPOINT ---
@app.post("/api/login")
async def login_user(payload: LoginSchema):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT * FROM users WHERE LOWER(email) = %s AND password = %s",
        (payload.email.strip().lower(), payload.password),
    )
    user = cur.fetchone()
    cur.close()
    conn.close()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return {
        "message": "Login successful",
        "user": {
            "id": user["id"],
            "name": user["full_name"],
            "full_name": user["full_name"],
            "email": user["email"],
            "role": user["role"],
        },
    }


# --- 3. GET ALL USERS ---
@app.get("/api/users")
async def get_all_users():
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT id, full_name, email, contact_number, role FROM users")
    users = [dict(row) for row in cur.fetchall()]
    cur.close()
    conn.close()
    return users


# --- 4. FILE UPLOAD ENDPOINT ---
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        original_name = os.path.basename(file.filename or "file")
        safe_name = f"{uuid.uuid4().hex[:8]}_{original_name}"
        file_path = os.path.join(UPLOAD_DIR, safe_name)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"proof_url": f"/uploads/{safe_name}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


# --- 5. DTR SUBMIT ---
@app.post("/api/dtr/submit")
async def submit_dtr(request: Request):
    payload = await request.json()
    print("DTR Submission Payload:", payload)

    conn = get_conn()
    cur = conn.cursor()
    try:
        user_id = payload.get("user_id") or payload.get("userId")
        if not user_id:
            raise HTTPException(
                status_code=400,
                detail="Missing user_id. Pakisubukan mag-login muli.",
            )

        log_date = str(payload.get("log_date") or payload.get("date") or "")
        time_in = str(payload.get("time_in") or payload.get("timeIn") or "")
        time_out = str(payload.get("time_out") or payload.get("timeOut") or "")
        raw_notes = str(
            payload.get("raw_notes")
            or payload.get("notes")
            or payload.get("accomplishments")
            or ""
        )
        proof_url = str(
            payload.get("proof_url")
            or payload.get("proofUrl")
            or payload.get("proof")
            or ""
        )

        raw_hours = (
            payload.get("rendered_today")
            or payload.get("renderedHours")
            or payload.get("hoursRendered")
            or 8.0
        )
        try:
            rendered_today = float(raw_hours)
        except (ValueError, TypeError):
            rendered_today = 8.0

        cur.execute(
            """
            INSERT INTO dtr_logs (user_id, log_date, time_in, time_out, rendered_today, raw_notes, proof_url, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending')
            """,
            (user_id, log_date, time_in, time_out, rendered_today, raw_notes, proof_url),
        )
        conn.commit()
        return {"message": "DTR saved to database successfully"}

    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        print("DTR Database Error:", str(e))
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        cur.close()
        conn.close()


# --- 6. GET ALL DTR LOGS (Supervisor View with Messages Embedded) ---
@app.get("/api/dtr/all")
async def get_all_dtr_logs():
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT dtr_logs.*, users.full_name AS student_name
        FROM dtr_logs
        LEFT JOIN users ON dtr_logs.user_id = users.id
        ORDER BY dtr_logs.id DESC
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    logs = []
    for row in rows:
        dtr_item = dict(row)
        dtr_item["messages"] = get_messages_for_dtr(dtr_item["id"])
        logs.append(dtr_item)
    return logs


# --- 7. GET DTR LOGS BY USER (Student View with Messages Embedded) ---
@app.get("/api/dtr/{user_id}")
async def get_dtr_logs(user_id: int):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT * FROM dtr_logs WHERE user_id = %s ORDER BY id DESC", (user_id,)
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()

    logs = []
    for row in rows:
        dtr_item = dict(row)
        dtr_item["messages"] = get_messages_for_dtr(dtr_item["id"])
        logs.append(dtr_item)
    return logs


# --- 8. RESUBMIT DTR LOG ---
@app.put("/api/dtr/{dtr_id}/resubmit")
@app.put("/api/dtr/resubmit/{dtr_id}")
@app.put("/api/dtr/{dtr_id}")
async def resubmit_dtr(dtr_id: int, request: Request):
    payload = await request.json()
    conn = get_conn()
    cur = conn.cursor()

    try:
        cur.execute("SELECT id FROM dtr_logs WHERE id = %s", (dtr_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="DTR record not found")

        log_date = payload.get("log_date") or payload.get("date")
        time_in = payload.get("time_in") or payload.get("timeIn")
        time_out = payload.get("time_out") or payload.get("timeOut")
        rendered_today = (
            payload.get("rendered_today")
            or payload.get("renderedHours")
            or payload.get("hoursRendered")
        )
        raw_notes = (
            payload.get("raw_notes")
            or payload.get("notes")
            or payload.get("accomplishments")
            or payload.get("accomplishment")
        )
        proof_url = (
            payload.get("proof_url")
            or payload.get("proofUrl")
            or payload.get("proof")
        )

        if rendered_today is not None:
            try:
                rendered_today = float(rendered_today)
            except (ValueError, TypeError):
                rendered_today = None

        cur.execute(
            """
            UPDATE dtr_logs
            SET log_date = COALESCE(%s, log_date),
                time_in = COALESCE(%s, time_in),
                time_out = COALESCE(%s, time_out),
                rendered_today = COALESCE(%s, rendered_today),
                raw_notes = COALESCE(%s, raw_notes),
                proof_url = COALESCE(%s, proof_url),
                status = 'pending',
                rejection_reason = ''
            WHERE id = %s
            """,
            (log_date, time_in, time_out, rendered_today, raw_notes, proof_url, dtr_id),
        )
        conn.commit()
        return {"message": "DTR resubmitted successfully"}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        cur.close()
        conn.close()


# --- 9. STATUS UPDATE (Approve / Reject) ---
@app.patch("/api/dtr/{log_id}/status")
@app.put("/api/dtr/{log_id}/status")
async def update_status(log_id: int, payload: StatusUpdateSchema):
    new_status = payload.status.lower()
    reason = (payload.rejection_reason or "") if new_status == "rejected" else ""

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "UPDATE dtr_logs SET status = %s, rejection_reason = %s WHERE id = %s",
        (new_status, reason, log_id),
    )
    conn.commit()
    cur.close()
    conn.close()

    return {"message": "Status updated in database"}


# --- 10. GET REMARKS / MESSAGES ---
@app.get("/api/dtr/{dtr_id}/remarks")
@app.get("/api/dtr/{dtr_id}/messages")
async def get_remarks(dtr_id: int):
    return get_messages_for_dtr(dtr_id)


# --- 11. POST NEW REMARK / DISCUSSION MESSAGE ---
@app.post("/api/dtr/{dtr_id}/remarks")
@app.post("/api/dtr/{dtr_id}/messages")
async def add_remark(dtr_id: int, payload: RemarkSchema):
    sender_name = payload.sender_name or payload.sender or "User"
    sender_role = payload.sender_role or payload.role or payload.sender or "user"
    message = payload.message or payload.text or ""

    if not message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO dtr_remarks (dtr_id, sender_name, sender_role, message)"
            " VALUES (%s, %s, %s, %s)",
            (dtr_id, sender_name, sender_role, message),
        )
        conn.commit()
        return {"message": "Remark added successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        cur.close()
        conn.close()


# --- 12. INTERN DIRECTORY (Intern Profile & MOA ng Supervisor) ---
INTERN_SERVER_FIELDS = {
    "id",
    "portfolio_id",
    "email",
    "contact_number",
    "approvedHours",
    "approved_hours",
    "full_name",
    "internName",
}


def get_approved_hours(cur, user_id: int):
    cur.execute(
        "SELECT COALESCE(SUM(rendered_today), 0) FROM dtr_logs"
        " WHERE user_id = %s AND LOWER(status) = 'approved'",
        (user_id,),
    )
    return float(cur.fetchone()[0] or 0)


def load_saved_profile(cur, user_id: int):
    cur.execute("SELECT data FROM intern_profiles WHERE user_id = %s", (user_id,))
    row = cur.fetchone()
    if not row:
        return None
    try:
        data = json.loads(row[0])
        return data if isinstance(data, dict) else None
    except ValueError:
        return None


@app.get("/api/interns")
async def get_interns():
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT id, full_name, email, contact_number FROM users"
        " WHERE LOWER(role) = 'student' ORDER BY id ASC"
    )
    students = [dict(row) for row in cur.fetchall()]
    cur.close()

    plain = conn.cursor()
    interns = []
    for s in students:
        saved = load_saved_profile(plain, s["id"]) or {}
        profile = {}
        profile.update(saved)
        profile["internName"] = s["full_name"]
        profile["full_name"] = s["full_name"]
        profile["id"] = s["id"]
        profile["email"] = s["email"]
        profile["contact_number"] = s["contact_number"]
        profile["approvedHours"] = get_approved_hours(plain, s["id"])
        interns.append(profile)

    plain.close()
    conn.close()
    return interns


@app.get("/api/interns/{user_id}/profile")
async def get_intern_profile(user_id: int):
    conn = get_conn()
    cur = conn.cursor()
    saved = load_saved_profile(cur, user_id)
    cur.close()
    conn.close()

    if saved is None:
        raise HTTPException(status_code=404, detail="Wala pang naka-save na profile")
    return saved


@app.put("/api/interns/{user_id}/profile")
async def save_intern_profile(user_id: int, request: Request):
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid profile data")

    data = {k: v for k, v in payload.items() if k not in INTERN_SERVER_FIELDS}

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO intern_profiles (user_id, data, updated_at)"
            " VALUES (%s, %s, CURRENT_TIMESTAMP)"
            " ON CONFLICT (user_id) DO UPDATE"
            " SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP",
            (user_id, json.dumps(data)),
        )
        conn.commit()
        return {"message": "Intern profile saved"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        cur.close()
        conn.close()