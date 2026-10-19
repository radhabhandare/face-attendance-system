@"
# Face Recognition Attendance System

A Flask-based web app that registers users with multi-angle face captures and marks attendance automatically via face recognition.

## Features
- Multi-angle face registration (Front / Left / Right)
- Live per-angle quality checks (blur, brightness, face size)
- Mirror-aware camera capture
- Face login with blink-based liveness prompt
- Auto attendance logging to Excel (deduplicated per day)
- Friendly "not registered" flow with registration link

## Tech Stack
- Python 3.12, Flask
- face_recognition, dlib, OpenCV, NumPy
- OpenPyXL (Excel logs)
- Bootstrap 5, vanilla JS

## Setup
1. ``python -m venv venv``
2. ``venv\Scripts\activate``
3. ``pip install -r requirements.txt``
4. ``python app.py``
5. Open http://127.0.0.1:5000

## Notes
- User data and captured images are stored **outside** the repo for privacy.
- To change storage location, edit ``DATA_DIR`` in ``face_engine.py`` and ``CAPTURE_DIR`` in ``app.py``.
"@ | Out-File -Encoding utf8 README.md