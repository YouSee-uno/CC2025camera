const video = document.getElementById('preview');
const stopwatchDisplay = document.getElementById('stopwatch-display');
const timerStartBtn = document.getElementById('timerStartBtn');
const timerStopBtn = document.getElementById('timerStopBtn');
const timerResetBtn = document.getElementById('timerResetBtn');
const recordStartBtn = document.getElementById('recordStartBtn');
const recordStopBtn = document.getElementById('recordStopBtn');
const photoBtn = document.getElementById('photoBtn');
const switchCameraBtn = document.getElementById('switchCameraBtn');
const downloadContainer = document.getElementById('download-link-container');

const captureCanvas = document.createElement('canvas');
const ctx = captureCanvas.getContext('2d', { alpha: false });

let recorder;
let recordedChunks = [];
let timerStartTime = 0;
let elapsedTime = 0;
let timerRunning = false;
let timerRequestID;
let drawLoopID;
let mainStream = null;
let currentFacingMode = "user"; 

lucide.createIcons();

// 向き変更の検知
window.addEventListener('resize', () => {
    if (video.videoWidth) {
        captureCanvas.width = video.videoWidth;
        captureCanvas.height = video.videoHeight;
    }
});

async function setupCamera() {
    if (mainStream) mainStream.getTracks().forEach(track => track.stop());
    const constraints = {
        video: { facingMode: currentFacingMode, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        audio: true
    };
    try {
        mainStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = mainStream;
        video.style.transform = (currentFacingMode === "user") ? "scaleX(-1)" : "scaleX(1)";
        await video.play();
        captureCanvas.width = video.videoWidth;
        captureCanvas.height = video.videoHeight;
    } catch (err) {
        alert("Camera Access Error");
    }
}

function drawCanvasLoop() {
    if (!recorder || recorder.state === "inactive") return;
    ctx.save();
    if (currentFacingMode === "user") { ctx.translate(captureCanvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    ctx.restore();
    
    const timerText = stopwatchDisplay.innerText;
    const fontSize = Math.floor(captureCanvas.height * 0.08); // 解像度に合わせてフォントサイズを可変
    ctx.font = `bold ${fontSize}px 'BIZ UDGothic'`;
    ctx.strokeStyle = "white"; ctx.lineWidth = fontSize * 0.15;
    ctx.strokeText(timerText, fontSize * 0.5, fontSize * 1.2);
    ctx.fillStyle = "black"; ctx.fillText(timerText, fontSize * 0.5, fontSize * 1.2);
    drawLoopID = requestAnimationFrame(drawCanvasLoop);
}

function updateTimer() {
    if (!timerRunning) return;
    const now = Date.now();
    const diff = now - timerStartTime + elapsedTime;
    const m = String(Math.floor(diff / 60000)).padStart(2, '0');
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    const ms = String(Math.floor((diff % 1000) / 10)).padStart(2, '0');
    const timeStr = `${m}:${s}.${ms}`;
    if (stopwatchDisplay.innerText !== timeStr) stopwatchDisplay.innerText = timeStr;
    timerRequestID = requestAnimationFrame(updateTimer);
}

timerStartBtn.onclick = () => {
    timerRunning = true; timerStartTime = Date.now();
    updateTimer();
    timerStartBtn.disabled = true; timerStopBtn.disabled = false;
};

timerStopBtn.onclick = () => {
    timerRunning = false; elapsedTime += Date.now() - timerStartTime;
    cancelAnimationFrame(timerRequestID);
    timerStartBtn.disabled = false; timerStopBtn.disabled = true;
};

timerResetBtn.onclick = () => {
    timerRunning = false; cancelAnimationFrame(timerRequestID);
    elapsedTime = 0; stopwatchDisplay.innerText = "00:00.00";
    timerStartBtn.disabled = false; timerStopBtn.disabled = true;
};

recordStartBtn.onclick = () => {
    recordedChunks = [];
    downloadContainer.innerHTML = '';
    const canvasStream = captureCanvas.captureStream(30);
    const combinedStream = new MediaStream();
    canvasStream.getVideoTracks().forEach(track => combinedStream.addTrack(track));
    if (mainStream) mainStream.getAudioTracks().forEach(track => combinedStream.addTrack(track));

    const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm;codecs=vp8';
    recorder = new MediaRecorder(combinedStream, { mimeType });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    recorder.onstop = () => {
        cancelAnimationFrame(drawLoopID);
        const blob = new Blob(recordedChunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        downloadContainer.innerHTML = `<a href="${url}" download="timer_video.mp4" class="download-link-style">📥 保存</a>`;
    };
    recorder.start(1000);
    drawCanvasLoop();
    recordStartBtn.disabled = true; recordStopBtn.disabled = false;
};

recordStopBtn.onclick = () => {
    if (recorder) recorder.stop();
    recordStartBtn.disabled = false; recordStopBtn.disabled = true;
};

switchCameraBtn.onclick = async () => {
    if (recorder && recorder.state === "recording") return;
    currentFacingMode = (currentFacingMode === "user") ? "environment" : "user";
    await setupCamera();
};

photoBtn.onclick = () => {
    if (!recorder || recorder.state === "inactive") {
        ctx.save();
        if (currentFacingMode === "user") { ctx.translate(captureCanvas.width, 0); ctx.scale(-1, 1); }
        ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
        ctx.restore();
        const fontSize = Math.floor(captureCanvas.height * 0.08);
        ctx.font = `bold ${fontSize}px 'BIZ UDGothic'`;
        ctx.strokeStyle = "white"; ctx.lineWidth = fontSize * 0.15;
        ctx.strokeText(stopwatchDisplay.innerText, fontSize * 0.5, fontSize * 1.2);
        ctx.fillStyle = "black"; ctx.fillText(stopwatchDisplay.innerText, fontSize * 0.5, fontSize * 1.2);
    }
    const link = document.createElement('a');
    link.href = captureCanvas.toDataURL('image/jpeg', 0.85);
    link.download = `photo.jpg`;
    link.click();
};

setupCamera();