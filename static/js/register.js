// Tracks each angle: { status: 'ok' | 'bad' | 'checking', dataUrl: string|null, msg: string }
const slots = [
    { hint: "Front",       status: "empty", dataUrl: null, msg: "" },
    { hint: "Left ~30°",   status: "empty", dataUrl: null, msg: "" },
    { hint: "Right ~30°",  status: "empty", dataUrl: null, msg: "" },
];

const video      = document.getElementById('video');
const canvas     = document.getElementById('canvas');
const captureBtn = document.getElementById('captureBtn');
const submitBtn  = document.getElementById('submitBtn');
const angleHint  = document.getElementById('angleHint');
const preview    = document.getElementById('preview');
const msg        = document.getElementById('msg');
const mirrorBtn  = document.getElementById('mirrorBtn');

let mirrorMode = true;
let busy = false;

// --- Camera ---
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
        .then(stream => { video.srcObject = stream; })
        .catch(err => {
            msg.innerHTML = `<div class="alert alert-danger">Camera error: ${err.message}</div>`;
        });
} else {
    msg.innerHTML = '<div class="alert alert-danger">Camera not supported in this browser.</div>';
}

// --- Mirror toggle ---
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

// --- Slot helpers ---
function nextEmptyIndex() {
    return slots.findIndex(s => s.status === "empty" || s.status === "bad");
}

function allSlotsOk() {
    return slots.every(s => s.status === "ok");
}

function updateUI() {
    const idx = nextEmptyIndex();
    if (idx === -1) {
        angleHint.textContent = "All angles captured ✓";
        angleHint.classList.remove('bg-info');
        angleHint.classList.add('bg-success');
        captureBtn.disabled = true;
    } else {
        angleHint.textContent = "Current: " + slots[idx].hint;
        angleHint.classList.remove('bg-success');
        angleHint.classList.add('bg-info');
        captureBtn.disabled = false;
    }
    submitBtn.disabled = !allSlotsOk();

    // Render thumbnails
    preview.innerHTML = '';
    slots.forEach((slot, i) => {
        const wrap = document.createElement('div');
        wrap.className = 'd-flex flex-column align-items-center';
        wrap.style.width = '100px';

        if (slot.dataUrl) {
            const img = document.createElement('img');
            img.src = slot.dataUrl;
            img.style.width = '90px';
            img.style.height = '90px';
            img.className = 'border rounded object-fit-cover';
            wrap.appendChild(img);
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'border rounded bg-secondary bg-opacity-25 d-flex align-items-center justify-content-center';
            placeholder.style.width = '90px';
            placeholder.style.height = '90px';
            placeholder.innerHTML = `<small class="text-muted">${slot.hint}</small>`;
            wrap.appendChild(placeholder);
        }

        const label = document.createElement('small');
        label.className = 'mt-1 text-center';
        if (slot.status === 'ok') {
            label.classList.add('text-success');
            label.textContent = '✓ OK';
        } else if (slot.status === 'bad') {
            label.classList.add('text-danger');
            label.textContent = '✗ ' + (slot.msg || 'Retake');
        } else if (slot.status === 'checking') {
            label.classList.add('text-info');
            label.textContent = '⏳ Checking...';
        } else {
            label.classList.add('text-muted');
            label.textContent = slot.hint;
        }
        wrap.appendChild(label);

        if (slot.dataUrl) {
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'btn btn-sm btn-outline-danger mt-1';
            delBtn.textContent = 'Delete';
            delBtn.onclick = () => {
                slots[i] = { hint: slots[i].hint, status: 'empty', dataUrl: null, msg: '' };
                updateUI();
            };
            wrap.appendChild(delBtn);
        }

        preview.appendChild(wrap);
    });
}

// --- Capture ---
captureBtn.onclick = async () => {
    if (busy) return;
    const idx = nextEmptyIndex();
    if (idx === -1) return;

    busy = true;
    captureBtn.disabled = true;

    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (mirrorMode) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

    slots[idx].dataUrl = dataUrl;
    slots[idx].status = 'checking';
    slots[idx].msg = '';
    updateUI();

    try {
        const res = await fetch('/check_quality', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: dataUrl })
        });
        const data = await res.json();

        if (data.ok) {
            slots[idx].status = 'ok';
        } else {
            slots[idx].status = 'bad';
            slots[idx].msg = data.msg || 'Retake';
        }
    } catch (e) {
        slots[idx].status = 'bad';
        slots[idx].msg = 'Check failed';
    } finally {
        busy = false;
        updateUI();
    }
};

// --- Submit ---
submitBtn.onclick = () => {
    const name = document.getElementById('name').value.trim();
    const studentId = document.getElementById('student_id').value.trim();

    if (!name || !studentId) {
        msg.innerHTML = '<div class="alert alert-warning">Please fill in name and student ID.</div>';
        return;
    }
    if (!allSlotsOk()) {
        msg.innerHTML = '<div class="alert alert-warning">All three angles must pass quality check first.</div>';
        return;
    }

    submitBtn.disabled = true;
    msg.innerHTML = '<div class="alert alert-info">Processing registration...</div>';

    fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: name,
            student_id: studentId,
            images: slots.map(s => s.dataUrl)
        })
    })
    .then(async (r) => {
        const text = await r.text();
        try { return JSON.parse(text); }
        catch { return { ok: false, msg: `Server error (status ${r.status})` }; }
    })
    .then(data => {
        if (data.ok) {
            msg.innerHTML = `<div class="alert alert-success">${data.msg}</div>`;
            setTimeout(() => window.location.href = '/login', 1800);
        } else {
            msg.innerHTML = `<div class="alert alert-danger">${data.msg}</div>`;
            submitBtn.disabled = false;
        }
    })
    .catch(err => {
        msg.innerHTML = `<div class="alert alert-danger">Network error: ${err.message}</div>`;
        submitBtn.disabled = false;
    });
};

// Initial render
updateUI();