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
const ctx = captureCanvas.getContext('2d');

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

// Safari互換のMIMEタイプを特定する関数
function getSupportedMimeType() {
    const types = [
        'video/mp4', 
        'video/webm;codecs=vp9', 
        'video/webm;codecs=vp8', 
        'video/webm'
    ];
    for (let type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
}

async function setupCamera() {
    if (mainStream) mainStream.getTracks().forEach(track => track.stop());
    
    const constraints = {
        video: { 
            facingMode: currentFacingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 }
        },
        audio: true
    };

    try {
        mainStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = mainStream;
        video.style.transform = (currentFacingMode === "user") ? "scaleX(-1)" : "scaleX(1)";
        
        // Safariでは明示的にplay()を呼ぶ必要がある
        await video.play();
        
        captureCanvas.width = video.videoWidth;
        captureCanvas.height = video.videoHeight;
    } catch (err) {
        console.error(err);
        alert("カメラの起動に失敗しました。Safariの設定でカメラを許可してください。");
    }
}

function drawCanvasLoop() {
    if (!recorder || recorder.state === "inactive") return;
    
    ctx.save();
    if (currentFacingMode === "user") {
        ctx.translate(captureCanvas.width, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    ctx.restore();
    
    const timerText = stopwatchDisplay.textContent;
    ctx.font = "bold 60px 'BIZ UDGothic'";
    ctx.strokeStyle = "white"; 
    ctx.lineWidth = 10; 
    ctx.lineJoin = "round";
    ctx.strokeText(timerText, 40, 90);
    ctx.fillStyle = "black"; 
    ctx.fillText(timerText, 40, 90);
    
    drawLoopID = requestAnimationFrame(drawCanvasLoop);
}

function updateTimer() {
    if (!timerRunning) return;
    const now = Date.now();
    const diff = now - timerStartTime + elapsedTime;
    const m = String(Math.floor(diff / 60000)).padStart(2, '0');
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    const ms = String(Math.floor((diff % 1000) / 10)).padStart(2, '0');
    stopwatchDisplay.textContent = `${m}:${s}.${ms}`;
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
    elapsedTime = 0; stopwatchDisplay.textContent = "00:00.00";
    timerStartBtn.disabled = false; timerStopBtn.disabled = true;
};

recordStartBtn.onclick = () => {
    recordedChunks = [];
    const mimeType = getSupportedMimeType();
    
    // Canvasから映像、マイクから音声を合成
    const canvasStream = captureCanvas.captureStream(30);
    const combinedStream = new MediaStream();
    
    canvasStream.getVideoTracks().forEach(track => combinedStream.addTrack(track));
    if (mainStream) {
        mainStream.getAudioTracks().forEach(track => combinedStream.addTrack(track));
    }

    try {
        recorder = new MediaRecorder(combinedStream, { mimeType });
        recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
        recorder.onstop = () => {
            cancelAnimationFrame(drawLoopID);
            const blob = new Blob(recordedChunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
            downloadContainer.innerHTML = `<a href="${url}" download="video_${Date.now()}.${ext}" class="download-link-style">📥 動画を保存</a>`;
        };
        recorder.start(1000);
        drawCanvasLoop();
        recordStartBtn.disabled = true; recordStopBtn.disabled = false;
    } catch (e) {
        alert("このブラウザは録画に対応していません。");
    }
};

recordStopBtn.onclick = () => {
    if (recorder && recorder.state !== "inactive") recorder.stop();
    recordStartBtn.disabled = false; recordStopBtn.disabled = true;
};

switchCameraBtn.onclick = async () => {
    if (recorder && recorder.state === "recording") return;
    currentFacingMode = (currentFacingMode === "user") ? "environment" : "user";
    await setupCamera();
};

photoBtn.onclick = () => {
    ctx.save();
    if (currentFacingMode === "user") { ctx.translate(captureCanvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    ctx.restore();
    
    const timerText = stopwatchDisplay.textContent;
    ctx.font = "bold 60px 'BIZ UDGothic'";
    ctx.strokeStyle = "white"; ctx.lineWidth = 10;
    ctx.strokeText(timerText, 40, 90);
    ctx.fillStyle = "black"; ctx.fillText(timerText, 40, 90);
    
    const link = document.createElement('a');
    link.href = captureCanvas.toDataURL('image/jpeg', 0.9);
    link.download = `photo_${Date.now()}.jpg`;
    link.click();
};

setupCamera();