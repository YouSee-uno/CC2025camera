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

// Safari互換のMIMEタイプ特定
function getSupportedMimeType() {
    const types = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (let type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
}

async function setupCamera() {
    if (mainStream) mainStream.getTracks().forEach(track => track.stop());
    const constraints = {
        video: { facingMode: currentFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
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
        alert("カメラの起動に失敗しました。");
    }
}

/**
 * 録画用Canvas描画ループ (録画中のみ実行)
 * requestAnimationFrameを使用して滑らかさを確保
 */
function drawCanvasLoop() {
    if (!recorder || recorder.state === "inactive") return;

    // 映像描画
    ctx.save();
    if (currentFacingMode === "user") {
        ctx.translate(captureCanvas.width, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    ctx.restore();
    
    // タイマー焼き込み
    const timerText = stopwatchDisplay.textContent;
    ctx.font = "bold 60px 'BIZ UDGothic'";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    
    // 録画ファイル側の縁取り
    ctx.strokeStyle = "white"; 
    ctx.lineWidth = 10; 
    ctx.lineJoin = "round";
    ctx.strokeText(timerText, 40, 40);
    ctx.fillStyle = "black"; 
    ctx.fillText(timerText, 40, 40);
    
    drawLoopID = requestAnimationFrame(drawCanvasLoop);
}

/**
 * 画面表示用タイマー更新 (独立ループ)
 */
function updateTimerDisplay() {
    if (!timerRunning) return;

    const now = Date.now();
    const diff = now - timerStartTime + elapsedTime;
    
    const m = String(Math.floor(diff / 60000)).padStart(2, '0');
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    const ms = String(Math.floor((diff % 1000) / 10)).padStart(2, '0');
    
    const timeStr = `${m}:${s}.${ms}`;
    
    // DOM操作の負荷を最小限にするため、値が変わった時のみ更新
    if (stopwatchDisplay.innerText !== timeStr) {
        stopwatchDisplay.innerText = timeStr;
    }
    
    timerRequestID = requestAnimationFrame(updateTimerDisplay);
}

timerStartBtn.onclick = () => {
    timerRunning = true;
    timerStartTime = Date.now();
    updateTimerDisplay(); // タイマー専用ループ開始
    timerStartBtn.disabled = true;
    timerStopBtn.disabled = false;
};

timerStopBtn.onclick = () => {
    timerRunning = false;
    elapsedTime += Date.now() - timerStartTime;
    cancelAnimationFrame(timerRequestID);
    timerStartBtn.disabled = false;
    timerStopBtn.disabled = true;
};

timerResetBtn.onclick = () => {
    timerRunning = false;
    cancelAnimationFrame(timerRequestID);
    elapsedTime = 0;
    stopwatchDisplay.innerText = "00:00.00";
    timerStartBtn.disabled = false;
    timerStopBtn.disabled = true;
};

recordStartBtn.onclick = () => {
    recordedChunks = [];
    const mimeType = getSupportedMimeType();
    
    // Canvas(映像) + mainStream(音声) の合成
    const canvasStream = captureCanvas.captureStream(30); // 30fps固定で安定化
    const combinedStream = new MediaStream();
    
    canvasStream.getVideoTracks().forEach(track => combinedStream.addTrack(track));
    if (mainStream) {
        mainStream.getAudioTracks().forEach(track => combinedStream.addTrack(track));
    }

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
    drawCanvasLoop(); // 録画用描画ループ開始
    
    recordStartBtn.disabled = true;
    recordStopBtn.disabled = false;
};

recordStopBtn.onclick = () => {
    if (recorder && recorder.state !== "inactive") recorder.stop();
    recordStartBtn.disabled = false;
    recordStopBtn.disabled = true;
};

switchCameraBtn.onclick = async () => {
    if (recorder && recorder.state === "recording") return;
    currentFacingMode = (currentFacingMode === "user") ? "environment" : "user";
    await setupCamera();
};

photoBtn.onclick = () => {
    // 現在のフレームをCanvasに描画して保存
    ctx.save();
    if (currentFacingMode === "user") { ctx.translate(captureCanvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    ctx.restore();
    
    ctx.font = "bold 60px 'BIZ UDGothic'";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.strokeStyle = "white"; ctx.lineWidth = 10;
    ctx.strokeText(stopwatchDisplay.innerText, 40, 40);
    ctx.fillStyle = "black"; ctx.fillText(stopwatchDisplay.innerText, 40, 40);
    
    const link = document.createElement('a');
    link.href = captureCanvas.toDataURL('image/jpeg', 0.9);
    link.download = `photo_${Date.now()}.jpg`;
    link.click();
};

setupCamera();