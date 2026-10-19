const video      = document.getElementById('video');
const canvas     = document.getElementById('canvas');
const startBtn   = document.getElementById('startLogin');
const retakeBtn  = document.getElementById('retakeBtn');
const msg        = document.getElementById('msg');
const result     = document.getElementById('result');
const mirrorBtn  = document.getElementById('mirrorBtn');

let streamRef = null;
let mirrorMode = true; // laptop webcams are usually mirrored

// --- Start camera ---
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
        .then(stream => {
            streamRef = stream;
            video.srcObject = stream;
        })
        .catch(err => {
            msg.className = 'alert alert-danger';
            msg.textContent = 'Camera error: ' + err.message;
        });
} else {
    msg.className = 'alert alert-danger';
    msg.textContent = 'Camera not supported in this browser.';
}

// --- Mirror CSS toggle (preview only) ---
function applyMirrorCSS() {
    video.style.transform = mirrorMode ? 'scaleX(-1)' : 'scaleX(1)';
}
applyMirrorCSS();

if (mirrorBtn) {
    mirrorBtn.onclick = () => {
        mirrorMode = !mirrorMode;
        applyMirrorCSS();
        mirrorBtn.textContent = mirrorMode ? 'Mirror: ON' : 'Mirror: OFF';
    };
}

// --- Start login (with liveness prompt) ---
startBtn.onclick = () => {
    startBtn.disabled = true;
    retakeBtn.style.display = 'none';
    result.classList.add('d-none');
    msg.className = 'alert alert-info';
    msg.textContent = 'Please blink naturally to confirm liveness...';

    setTimeout(() => {
        captureAndSubmit();
    }, 3000);
};

function captureAndSubmit() {
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // If mirrored preview, flip canvas so the saved image is in real-world orientation
    if (mirrorMode) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

    msg.className = 'alert alert-info';
    msg.textContent = 'Recognizing...';

    fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl })
    })
    .then(async (r) => {
        const text = await r.text();
        try {
            return JSON.parse(text);
        } catch {
            console.error("Non-JSON response:", text.slice(0, 500));
            return { ok: false, msg: `Server error (status ${r.status}). Check terminal.` };
        }
    })
    .then(data => {
        if (data.ok) {
            msg.className = 'alert alert-success';
            msg.innerHTML = data.msg;
            result.classList.remove('d-none');
            document.getElementById('resName').textContent = data.name;
            document.getElementById('resId').textContent = data.student_id;
            document.getElementById('resConf').textContent = data.confidence + '%';
            retakeBtn.style.display = 'inline-block';
        } else {
            msg.className = 'alert alert-warning';
            if (data.need_register) {
                msg.innerHTML = data.msg + ' <a href="/register" class="alert-link">Go to Register →</a>';
            } else {
                msg.textContent = data.msg;
            }
            startBtn.disabled = false;
        }
    })
    .catch(err => {
        msg.className = 'alert alert-danger';
        msg.textContent = 'Network error: ' + err.message;
        startBtn.disabled = false;
    });
}

retakeBtn.onclick = () => {
    startBtn.disabled = false;
    retakeBtn.style.display = 'none';
    result.classList.add('d-none');
    msg.className = 'alert alert-secondary';
    msg.textContent = 'Camera ready. Click Start Login to begin.';
};