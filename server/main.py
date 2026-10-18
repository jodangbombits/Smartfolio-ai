import hashlib
import hmac
import json
import os
import random
import re
import secrets
import time
import urllib.error
import urllib.request
import uuid
from typing import Optional

import psycopg2
import psycopg2.extras
from psycopg2 import pool as pg_pool
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================================================================
# CONFIG (lahat galing sa Render Environment, walang secret sa code)
# =====================================================================
BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "jodangbombits@gmail.com")
SENDER_NAME = "SmartFolio OJT"

DATABASE_URL = os.environ.get("DATABASE_URL", "")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
SUPABASE_BUCKET = os.environ.get("SUPABASE_BUCKET", "proofs")

# Kapag naka-set, kailangan ito para gumawa ng Supervisor account
SUPERVISOR_INVITE_CODE = os.environ.get("SUPERVISOR_INVITE_CODE", "")

MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB

# In-memory OTP storage (email -> otp_code) at verified emails (email -> timestamp)
otp_store = {}
verified_emails = {}
VERIFIED_TTL_SECONDS = 15 * 60

# Fallback lang kapag walang Supabase Storage (local testing)
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# =====================================================================
# DATABASE
# =====================================================================
_pool = None


class PooledConn:
    """Parang normal na connection, pero ibinabalik sa pool ang close() imbes na isara."""

    def __init__(self, conn):
        self._c = conn

    def cursor(self, *args, **kwargs):
        return self._c.cursor(*args, **kwargs)

    def commit(self):
        self._c.commit()

    def rollback(self):
        self._c.rollback()

    def close(self):
        global _pool
        try:
            self._c.rollback()
        except Exception:
            pass
        try:
            _pool.putconn(self._c)
        except Exception:
            pass


def get_conn():
    """Nagre-reuse ng koneksyon para hindi mabagal ang bawat request."""
    global _pool
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set")
    if _pool is None:
        _pool = pg_pool.ThreadedConnectionPool(
            1,
            8,
            DATABASE_URL,
            keepalives=1,
            keepalives_idle=30,
            keepalives_interval=10,
            keepalives_count=3,
        )
    for _ in range(3):
        c = _pool.getconn()
        try:
            if c.closed:
                raise Exception("closed")
            cur = c.cursor()
            cur.execute("SELECT 1")
            cur.close()
            c.rollback()
            return PooledConn(c)
        except Exception:
            try:
                _pool.putconn(c, close=True)
            except Exception:
                pass
    raise RuntimeError("Hindi makakonekta sa database")


def init_db():
    conn = get_conn()
    cur = conn.cursor()

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

    cur.execute("""
        CREATE TABLE IF NOT EXISTS intern_profiles (
            user_id INTEGER PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Isara ang public Data API ng Supabase sa mga table na ito.
    # (Hindi apektado ang backend, kasi direct Postgres ang gamit niya.)
    for table in ("users", "dtr_logs", "dtr_remarks", "intern_profiles"):
        cur.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")

    conn.commit()
    cur.close()
    conn.close()


init_db()


# =====================================================================
# PASSWORD HASHING (stdlib lang; tumatanggap pa rin ng lumang plain-text
# at ina-upgrade ito sa hash pag-login)
# =====================================================================
def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), 200_000
    )
    return f"pbkdf2${salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    if stored and stored.startswith("pbkdf2$"):
        try:
            _, salt, digest = stored.split("$")
        except ValueError:
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt), 200_000
        )
        return hmac.compare_digest(dk.hex(), digest)
    # lumang account na plain-text
    return hmac.compare_digest(stored or "", password)


# =====================================================================
# SUPABASE STORAGE (permanenteng proof uploads)
# =====================================================================
def storage_enabled() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)


def ensure_bucket():
    """Gagawa ng public bucket kung wala pa. Hindi magcra-crash ang app kapag nag-fail."""
    if not storage_enabled():
        print("Supabase Storage not configured; using local uploads (hindi permanente).")
        return
    body = json.dumps({
        "id": SUPABASE_BUCKET,
        "name": SUPABASE_BUCKET,
        "public": True,
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{SUPABASE_URL}/storage/v1/bucket",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "apikey": SUPABASE_SERVICE_KEY,
            "Content-Type": "application/json",
        },
    )
    try:
        urllib.request.urlopen(req, timeout=15)
        print(f"Created storage bucket '{SUPABASE_BUCKET}'")
    except urllib.error.HTTPError as e:
        # 400/409 = nandiyan na ang bucket, okay lang
        print(f"Bucket check: HTTP {e.code} (ok kung existing na)")
    except Exception as e:
        print(f"Bucket check failed: {e}")


ensure_bucket()


def upload_to_supabase_sync(name: str, data: bytes, content_type: str) -> str:
    url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{name}"
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "apikey": SUPABASE_SERVICE_KEY,
            "Content-Type": content_type or "application/octet-stream",
            "x-upsert": "true",
        },
    )
    try:
        urllib.request.urlopen(req, timeout=60)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="ignore")
        raise Exception(f"Storage {e.code}: {detail}")
    return f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{name}"


# =====================================================================
# EMAIL (Brevo)
# =====================================================================
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
    timestamp: Optional[str] = None


class OTPRequestSchema(BaseModel):
    email: str


class OTPVerifySchema(BaseModel):
    email: str
    code: str


# =====================================================================
# HELPERS
# =====================================================================
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


def get_messages_map(dtr_ids):
    """Isang query lang para sa messages ng lahat ng DTR (imbes na isa kada DTR)."""
    result = {i: [] for i in dtr_ids}
    if not dtr_ids:
        return result
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT id, dtr_id, sender_name, sender_role, message, created_at"
        " FROM dtr_remarks WHERE dtr_id = ANY(%s) ORDER BY id ASC",
        (list(dtr_ids),),
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    for r in rows:
        sender_role = (r["sender_role"] or "").lower()
        sender_type = "supervisor" if "supervisor" in sender_role else "student"
        created = r["created_at"]
        result.setdefault(r["dtr_id"], []).append({
            "id": r["id"],
            "dtr_id": r["dtr_id"],
            "sender": sender_type,
            "sender_name": r["sender_name"],
            "sender_role": r["sender_role"],
            "message": r["message"],
            "text": r["message"],
            "timestamp": str(created) if created is not None else None,
        })
    return result


@app.get("/")
async def health():
    return {"status": "ok", "service": "SmartFolio API"}


# =====================================================================
# OTP
# =====================================================================
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
            msg = "Mali ang Brevo API key sa Render Environment"
        elif "sender" in msg.lower():
            msg = "Hindi pa verified ang SENDER_EMAIL sa Brevo (Senders & IP)"
        elif "timed out" in msg or "getaddrinfo" in msg:
            msg = "Walang koneksyon (subukan ulit)"
        raise HTTPException(
            status_code=500, detail=f"Failed to send email: {msg}"
        )


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
        verified_emails[email_key] = time.time()
        return {"status": "success", "message": "Email verified successfully"}
    raise HTTPException(
        status_code=400, detail="Mali ang Verification Code! Pakisuri ulit."
    )


# =====================================================================
# AUTH
# =====================================================================
@app.post("/api/register")
async def register_user(payload: RegisterSchema):
    email = payload.email.strip().lower()
    role = (payload.role or "student").lower()

    if role not in ("student", "supervisor"):
        raise HTTPException(status_code=400, detail="Invalid role")

    # Kailangang na-verify muna ang email via OTP
    verified_at = verified_emails.get(email)
    if not verified_at or time.time() - verified_at > VERIFIED_TTL_SECONDS:
        raise HTTPException(
            status_code=400,
            detail="Hindi pa na-verify ang email. Kumuha ng OTP at i-verify muna.",
        )

    # Supervisor invite code check
    if role == "supervisor" and SUPERVISOR_INVITE_CODE:
        if not hmac.compare_digest(
            (payload.invite_code or "").strip(), SUPERVISOR_INVITE_CODE
        ):
            raise HTTPException(
                status_code=403, detail="Mali ang Supervisor Invite Code."
            )

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO users (full_name, email, contact_number, password, role)"
            " VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (
                payload.full_name,
                email,
                payload.contact_number,
                hash_password(payload.password),
                role,
            ),
        )
        user_id = cur.fetchone()[0]
        conn.commit()
        verified_emails.pop(email, None)
        return {"message": "User registered successfully", "user_id": user_id}
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(status_code=400, detail="Email already registered")
    finally:
        cur.close()
        conn.close()


@app.post("/api/login")
async def login_user(payload: LoginSchema):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        "SELECT * FROM users WHERE LOWER(email) = %s",
        (payload.email.strip().lower(),),
    )
    user = cur.fetchone()

    if not user or not verify_password(payload.password, user["password"]):
        cur.close()
        conn.close()
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # I-upgrade ang lumang plain-text password sa hash
    if not (user["password"] or "").startswith("pbkdf2$"):
        cur.execute(
            "UPDATE users SET password = %s WHERE id = %s",
            (hash_password(payload.password), user["id"]),
        )
        conn.commit()

    cur.close()
    conn.close()

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


@app.get("/api/users")
async def get_all_users():
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT id, full_name, email, contact_number, role FROM users")
    users = [dict(row) for row in cur.fetchall()]
    cur.close()
    conn.close()
    return users


# =====================================================================
# FILE UPLOAD (Supabase Storage = permanente)
# =====================================================================
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        original_name = os.path.basename(file.filename or "file")
        clean = re.sub(r"[^A-Za-z0-9._-]", "_", original_name)
        safe_name = f"{uuid.uuid4().hex[:8]}_{clean}"

        data = await file.read()
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413, detail="Masyadong malaki ang file (max 15 MB)."
            )

        if storage_enabled():
            public_url = await run_in_threadpool(
                upload_to_supabase_sync, safe_name, data, file.content_type
            )
            return {"proof_url": public_url}

        # Fallback (hindi permanente)
        with open(os.path.join(UPLOAD_DIR, safe_name), "wb") as buffer:
            buffer.write(data)
        return {"proof_url": f"/uploads/{safe_name}"}
    except HTTPException:
        raise
    except Exception as e:
        print("Upload error:", str(e))
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


# =====================================================================
# DTR
# =====================================================================
@app.post("/api/dtr/submit")
async def submit_dtr(request: Request):
    payload = await request.json()

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

    msg_map = get_messages_map([r["id"] for r in rows])
    logs = []
    for row in rows:
        dtr_item = dict(row)
        dtr_item["messages"] = msg_map.get(dtr_item["id"], [])
        logs.append(dtr_item)
    return logs


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

    msg_map = get_messages_map([r["id"] for r in rows])
    logs = []
    for row in rows:
        dtr_item = dict(row)
        dtr_item["messages"] = msg_map.get(dtr_item["id"], [])
        logs.append(dtr_item)
    return logs


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


@app.get("/api/dtr/{dtr_id}/remarks")
@app.get("/api/dtr/{dtr_id}/messages")
async def get_remarks(dtr_id: int):
    return get_messages_for_dtr(dtr_id)


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


# =====================================================================
# INTERN DIRECTORY
# =====================================================================
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

    saved_map = {}
    plain.execute("SELECT user_id, data FROM intern_profiles")
    for uid, raw in plain.fetchall():
        try:
            d = json.loads(raw)
            if isinstance(d, dict):
                saved_map[uid] = d
        except ValueError:
            pass

    hours_map = {}
    plain.execute(
        "SELECT user_id, COALESCE(SUM(rendered_today), 0) FROM dtr_logs"
        " WHERE LOWER(status) = 'approved' GROUP BY user_id"
    )
    for uid, hrs in plain.fetchall():
        hours_map[uid] = float(hrs or 0)

    interns = []
    for s in students:
        profile = {}
        profile.update(saved_map.get(s["id"], {}))
        profile["internName"] = s["full_name"]
        profile["full_name"] = s["full_name"]
        profile["id"] = s["id"]
        profile["email"] = s["email"]
        profile["contact_number"] = s["contact_number"]
        profile["approvedHours"] = hours_map.get(s["id"], 0)
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