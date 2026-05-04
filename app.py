from __future__ import annotations

import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import Flask, jsonify, request, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "sky")
DB_PATH = os.path.join(BASE_DIR, "admin_portal.db")
CATEGORIES = {"technology", "business", "design", "marketing", "data", "other"}
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="")
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-me")
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"


def get_db() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db


def init_db() -> None:
    with get_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS reset_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                admin_id INTEGER NOT NULL,
                token TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS opportunities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                admin_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                duration TEXT NOT NULL,
                start_date TEXT NOT NULL,
                description TEXT NOT NULL,
                skills TEXT NOT NULL,
                category TEXT NOT NULL,
                future_opportunities TEXT NOT NULL,
                max_applicants INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
            );
            """
        )


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def admin_payload(admin: sqlite3.Row) -> dict:
    return {"id": admin["id"], "fullName": admin["full_name"], "email": admin["email"]}


def opportunity_payload(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "duration": row["duration"],
        "startDate": row["start_date"],
        "description": row["description"],
        "skills": [skill.strip() for skill in row["skills"].split(",") if skill.strip()],
        "category": row["category"],
        "futureOpportunities": row["future_opportunities"],
        "maxApplicants": row["max_applicants"],
    }


def current_admin() -> sqlite3.Row | None:
    admin_id = session.get("admin_id")
    if not admin_id:
        return None
    with get_db() as db:
        return db.execute("SELECT * FROM admins WHERE id = ?", (admin_id,)).fetchone()


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        admin = current_admin()
        if not admin:
            return jsonify({"error": "Authentication required"}), 401
        return view(admin, *args, **kwargs)

    return wrapped


def validate_opportunity(data: dict) -> tuple[dict | None, tuple[dict, int] | None]:
    required = ["name", "duration", "startDate", "description", "skills", "category", "futureOpportunities"]
    cleaned = {key: data.get(key) for key in required}
    for key in required:
        if isinstance(cleaned[key], str):
            cleaned[key] = cleaned[key].strip()
        if not cleaned[key]:
            return None, ({"error": "Please fill all required fields"}, 400)

    skills = data.get("skills")
    if isinstance(skills, list):
        skills_list = [str(skill).strip() for skill in skills if str(skill).strip()]
    else:
        skills_list = [skill.strip() for skill in str(skills).split(",") if skill.strip()]
    if not skills_list:
        return None, ({"error": "Please add at least one skill"}, 400)

    if cleaned["category"] not in CATEGORIES:
        return None, ({"error": "Please select a valid category"}, 400)

    max_applicants = data.get("maxApplicants")
    if max_applicants in ("", None):
        max_applicants = None
    else:
        try:
            max_applicants = int(max_applicants)
            if max_applicants < 0:
                raise ValueError
        except (TypeError, ValueError):
            return None, ({"error": "Maximum applicants must be a positive number"}, 400)

    cleaned["skills"] = skills_list
    cleaned["maxApplicants"] = max_applicants
    return cleaned, None


@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "admin.html")


@app.route("/<path:path>")
def static_files(path: str):
    return send_from_directory(STATIC_DIR, path)


@app.post("/api/auth/signup")
def signup():
    data = request.get_json(silent=True) or {}
    full_name = str(data.get("fullName", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    confirm_password = str(data.get("confirmPassword", ""))

    if not full_name or not email or not password or not confirm_password:
        return jsonify({"error": "All fields are required"}), 400
    if not EMAIL_RE.match(email):
        return jsonify({"error": "Please enter a valid email address"}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400
    if password != confirm_password:
        return jsonify({"error": "Passwords do not match"}), 400

    try:
        with get_db() as db:
            db.execute(
                "INSERT INTO admins (full_name, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (full_name, email, generate_password_hash(password), now_iso()),
            )
    except sqlite3.IntegrityError:
        return jsonify({"error": "An account with this email already exists"}), 409

    return jsonify({"message": "Account created successfully"}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    remember = bool(data.get("remember"))

    with get_db() as db:
        admin = db.execute("SELECT * FROM admins WHERE email = ?", (email,)).fetchone()

    if not admin or not check_password_hash(admin["password_hash"], password):
        return jsonify({"error": "Invalid email or password"}), 401

    session.clear()
    session["admin_id"] = admin["id"]
    session.permanent = remember
    app.permanent_session_lifetime = timedelta(days=30 if remember else 1)
    return jsonify({"message": "Login successful", "admin": admin_payload(admin)})


@app.post("/api/auth/logout")
def logout():
    session.clear()
    return jsonify({"message": "Signed out successfully"})


@app.get("/api/auth/me")
@login_required
def me(admin):
    return jsonify({"admin": admin_payload(admin)})


@app.post("/api/auth/forgot-password")
def forgot_password():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()

    if not EMAIL_RE.match(email):
        return jsonify({"error": "Please enter a valid email address"}), 400

    with get_db() as db:
        admin = db.execute("SELECT * FROM admins WHERE email = ?", (email,)).fetchone()
        if admin:
            token = secrets.token_urlsafe(32)
            expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
            db.execute(
                "INSERT INTO reset_tokens (admin_id, token, expires_at, created_at) VALUES (?, ?, ?, ?)",
                (admin["id"], token, expires_at.isoformat(), now_iso()),
            )
            reset_link = request.host_url.rstrip("/") + f"/api/auth/reset/{token}"
            app.logger.info("Password reset link for %s: %s", email, reset_link)

    return jsonify({"message": "If an account exists for that email, a reset link has been generated."})


@app.get("/api/auth/reset/<token>")
def reset_token_status(token: str):
    with get_db() as db:
        row = db.execute("SELECT * FROM reset_tokens WHERE token = ?", (token,)).fetchone()
    if not row:
        return jsonify({"error": "Reset link is invalid"}), 404

    expires_at = datetime.fromisoformat(row["expires_at"])
    if expires_at < datetime.now(timezone.utc):
        return jsonify({"error": "Reset link has expired"}), 410
    return jsonify({"message": "Reset link is valid"})


@app.get("/api/opportunities")
@login_required
def list_opportunities(admin):
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM opportunities WHERE admin_id = ? ORDER BY created_at DESC",
            (admin["id"],),
        ).fetchall()
    return jsonify({"opportunities": [opportunity_payload(row) for row in rows]})


@app.post("/api/opportunities")
@login_required
def create_opportunity(admin):
    data, error = validate_opportunity(request.get_json(silent=True) or {})
    if error:
        return jsonify(error[0]), error[1]

    timestamp = now_iso()
    with get_db() as db:
        cursor = db.execute(
            """
            INSERT INTO opportunities
                (admin_id, name, duration, start_date, description, skills, category,
                 future_opportunities, max_applicants, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                admin["id"],
                data["name"],
                data["duration"],
                data["startDate"],
                data["description"],
                ",".join(data["skills"]),
                data["category"],
                data["futureOpportunities"],
                data["maxApplicants"],
                timestamp,
                timestamp,
            ),
        )
        row = db.execute("SELECT * FROM opportunities WHERE id = ?", (cursor.lastrowid,)).fetchone()

    return jsonify({"opportunity": opportunity_payload(row)}), 201


@app.put("/api/opportunities/<int:opportunity_id>")
@login_required
def update_opportunity(admin, opportunity_id: int):
    data, error = validate_opportunity(request.get_json(silent=True) or {})
    if error:
        return jsonify(error[0]), error[1]

    with get_db() as db:
        row = db.execute(
            "SELECT id FROM opportunities WHERE id = ? AND admin_id = ?",
            (opportunity_id, admin["id"]),
        ).fetchone()
        if not row:
            return jsonify({"error": "Opportunity not found"}), 404

        db.execute(
            """
            UPDATE opportunities
            SET name = ?, duration = ?, start_date = ?, description = ?, skills = ?,
                category = ?, future_opportunities = ?, max_applicants = ?, updated_at = ?
            WHERE id = ? AND admin_id = ?
            """,
            (
                data["name"],
                data["duration"],
                data["startDate"],
                data["description"],
                ",".join(data["skills"]),
                data["category"],
                data["futureOpportunities"],
                data["maxApplicants"],
                now_iso(),
                opportunity_id,
                admin["id"],
            ),
        )
        updated = db.execute("SELECT * FROM opportunities WHERE id = ?", (opportunity_id,)).fetchone()

    return jsonify({"opportunity": opportunity_payload(updated)})


@app.delete("/api/opportunities/<int:opportunity_id>")
@login_required
def delete_opportunity(admin, opportunity_id: int):
    with get_db() as db:
        cursor = db.execute(
            "DELETE FROM opportunities WHERE id = ? AND admin_id = ?",
            (opportunity_id, admin["id"]),
        )
        if cursor.rowcount == 0:
            return jsonify({"error": "Opportunity not found"}), 404
    return jsonify({"message": "Opportunity deleted successfully"})


init_db()


if __name__ == "__main__":
    app.run(debug=True)
