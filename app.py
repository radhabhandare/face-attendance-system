from flask import Flask, render_template, request, jsonify
import os
import base64
import tempfile
from datetime import datetime

from face_engine import (
    load_users, save_users, encode_face_from_image,
    match_face, log_attendance, get_all_attendance
)
from utils.quality import check_quality

app = Flask(__name__)
app.secret_key = "dev-secret-key-change-in-production"

# Store captures OUTSIDE OneDrive so its sync engine cannot remove the folder.
CAPTURE_DIR = os.path.abspath(
    os.path.join(os.path.expanduser("~"), "face_attendance_captures")
)


def _safe_makedirs(path):
    try:
        os.makedirs(path, exist_ok=True)
    except (FileExistsError, OSError):
        pass


def _write_capture_file(filename, data_bytes):
    """
    Write bytes to CAPTURE_DIR/filename.
    Retries once by recreating the folder. Falls back to system temp dir if all fails.
    Returns the actual path written.
    """
    _safe_makedirs(CAPTURE_DIR)
    target = os.path.join(CAPTURE_DIR, filename)
    try:
        with open(target, "wb") as f:
            f.write(data_bytes)
        return target
    except FileNotFoundError:
        _safe_makedirs(CAPTURE_DIR)
        try:
            with open(target, "wb") as f:
                f.write(data_bytes)
            return target
        except FileNotFoundError:
            fallback = os.path.join(tempfile.gettempdir(), filename)
            with open(fallback, "wb") as f:
                f.write(data_bytes)
            return fallback


_safe_makedirs(CAPTURE_DIR)
_safe_makedirs("data")


@app.route("/")
def index():
    return render_template("index.html")


# ---------------- LIVE QUALITY CHECK (per-angle) ----------------
@app.route("/check_quality", methods=["POST"])
def check_quality_endpoint():
    data = request.get_json()
    image_b64 = data.get("image", "")
    if not image_b64:
        return jsonify({"ok": False, "msg": "No image received"})

    try:
        header, encoded = image_b64.split(",", 1)
    except ValueError:
        return jsonify({"ok": False, "msg": "Invalid image data"})

    img_bytes = base64.b64decode(encoded)
    tmp_path = os.path.join(
        tempfile.gettempdir(),
        f"qcheck_{datetime.now().timestamp()}.jpg"
    )
    with open(tmp_path, "wb") as f:
        f.write(img_bytes)

    try:
        ok, msg = check_quality(tmp_path)
    finally:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except OSError:
            pass

    return jsonify({"ok": ok, "msg": msg})


# ---------------- REGISTRATION ----------------
@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "GET":
        return render_template("register.html")

    data = request.get_json()
    name = data.get("name", "").strip()
    student_id = data.get("student_id", "").strip()
    images = data.get("images", [])

    if not name or not student_id:
        return jsonify({"ok": False, "msg": "Name and Student ID are required"})
    if len(images) < 3:
        return jsonify({"ok": False, "msg": "Please capture all 3 angles"})

    users = load_users()
    if name in users:
        return jsonify({
            "ok": False,
            "msg": f"User '{name}' already exists. Use a different name or contact admin."
        })

    encodings = []
    saved_files = []

    for idx, b64 in enumerate(images):
        try:
            header, encoded = b64.split(",", 1)
        except ValueError:
            return jsonify({"ok": False, "msg": f"Angle {idx+1} image data invalid"})

        img_bytes = base64.b64decode(encoded)
        filename = f"{student_id}_angle{idx}.jpg"

        try:
            filepath = _write_capture_file(filename, img_bytes)
        except OSError as e:
            return jsonify({
                "ok": False,
                "msg": f"Angle {idx+1}: could not save capture ({e})."
            })
        saved_files.append(filepath)

        ok, msg = check_quality(filepath)
        if not ok:
            for fp in saved_files:
                try:
                    if os.path.exists(fp):
                        os.remove(fp)
                except OSError:
                    pass
            return jsonify({"ok": False, "msg": f"Angle {idx+1} failed quality check: {msg}"})

        enc = encode_face_from_image(filepath)
        if enc is None:
            for fp in saved_files:
                try:
                    if os.path.exists(fp):
                        os.remove(fp)
                except OSError:
                    pass
            return jsonify({"ok": False, "msg": f"Angle {idx+1}: no face detected, please retake"})
        encodings.append(enc)

    users[name] = {
        "student_id": student_id,
        "encodings": encodings,
        "registered_at": datetime.now().isoformat(),
    }
    save_users(users)

    return jsonify({
        "ok": True,
        "msg": f"{name} registered successfully with {len(encodings)} angle samples"
    })


# ---------------- LOGIN ----------------
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        return render_template("login.html")

    data = request.get_json()
    image_b64 = data.get("image", "")
    if not image_b64:
        return jsonify({"ok": False, "msg": "No image received"})

    try:
        header, encoded = image_b64.split(",", 1)
    except ValueError:
        return jsonify({"ok": False, "msg": "Invalid image format"})

    img_bytes = base64.b64decode(encoded)
    tmp_path = os.path.join(
        tempfile.gettempdir(),
        f"login_{datetime.now().timestamp()}.jpg"
    )
    with open(tmp_path, "wb") as f:
        f.write(img_bytes)

    try:
        enc = encode_face_from_image(tmp_path)
    finally:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except OSError:
            pass

    if enc is None:
        return jsonify({
            "ok": False,
            "msg": "No face detected. Please ensure your face is visible."
        })

    users = load_users()
    name, confidence = match_face(enc, users)

    if name is None:
        return jsonify({
            "ok": False,
            "msg": "This face is not registered. Please complete face registration first.",
            "need_register": True
        })

    info = users[name]
    recorded = log_attendance(name, info["student_id"], confidence)

    if recorded:
        return jsonify({
            "ok": True,
            "msg": f"Welcome, {name}! Attendance recorded ({confidence}% match).",
            "name": name,
            "student_id": info["student_id"],
            "confidence": confidence
        })
    else:
        return jsonify({
            "ok": True,
            "msg": f"Welcome back, {name}. Attendance already recorded today.",
            "name": name,
            "student_id": info["student_id"],
            "confidence": confidence
        })


# ---------------- DASHBOARD ----------------
@app.route("/dashboard")
def dashboard():
    records = get_all_attendance()
    return render_template("dashboard.html", records=records)


# ---------------- REGISTERED USERS LIST ----------------
@app.route("/api/users")
def api_users():
    users = load_users()
    out = [
        {"name": k, "student_id": v["student_id"], "samples": len(v["encodings"])}
        for k, v in users.items()
    ]
    return jsonify(out)


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)