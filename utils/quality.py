import cv2
import numpy as np

def check_quality(image_path):
    """
    Returns (passed: bool, reason: str).
    Checks: brightness, blur, and face presence.
    """
    img = cv2.imread(image_path)
    if img is None:
        return False, "Unable to read image"

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # --- Brightness check ---
    mean_brightness = np.mean(gray)
    if mean_brightness < 40:
        return False, "Environment too dark, please improve lighting"
    if mean_brightness > 220:
        return False, "Environment too bright, please avoid strong backlight"

    # --- Blur detection (Laplacian variance) ---
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    if laplacian_var < 80:
        return False, "Image blurry, please stay still and retake"

    # --- Face size check ---
    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    faces = face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(80, 80))
    if len(faces) == 0:
        return False, "No clear face detected"

    return True, "Qualified"