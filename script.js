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

// 1. カメラとマイクの初期化
async function setupCamera() {
    // 動作中のトラックがあれば全て停止（これが切り替えには必須）
    if (mainStream) {
        mainStream.getTracks().forEach(track => track.stop());
    }

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
        
        // 内カメラ（user）の時だけ鏡のように反転表示（録画には影響させない設定も可）
        video.style.transform = (currentFacingMode === "user") ? "scaleX(-1)" : "scaleX(1)";

        video.onloadedmetadata = () => {
            video.play();
            captureCanvas.width = video.videoWidth;
            captureCanvas.height = video.videoHeight;
        };
    } catch (err) {
        console.error("Camera Error:", err);
        alert("カメラの切り替えに失敗しました。このデバイスでは複数のカメラが許可されていない可能性があります。");
    }
}

// カメラ切り替え
switchCameraBtn.onclick = async () => {
    if (recorder && recorder.state === "recording") return;
    currentFacingMode = (currentFacingMode === "user") ? "environment" : "user";
    await setupCamera();
};

// 2. 合成描画ループ（タイマー焼き込み）
function drawCanvas() {
    // Canvasにカメラ映像を描画
    // 内カメラの場合はCanvas上も反転させるならここを調整
    ctx.save();
    if (currentFacingMode === "user") {
        ctx.translate(captureCanvas.width, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    ctx.restore();
    
    // タイマー描画
    const timerText = stopwatchDisplay.textContent;
    ctx.font = "bold 60px 'BIZ UDGothic'";
    const x = 40;
    const y = 90;

    ctx.strokeStyle = "white";
    ctx.lineWidth = 10;
    ctx.lineJoin = "round";
    ctx.strokeText(timerText, x, y);
    ctx.fillStyle = "black";
    ctx.fillText(timerText, x, y);

    drawLoopID = requestAnimationFrame(drawCanvas);
}

// 3. タイマー制御
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
    timerRunning = true;
    timerStartTime = Date.now();
    updateTimer();
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
    stopwatchDisplay.textContent = "00:00.00";
    timerStartBtn.disabled = false;
    timerStopBtn.disabled = true;
};

// 4. 録画
recordStartBtn.onclick = () => {
    recordedChunks = [];
    drawCanvas(); 
    const canvasStream = captureCanvas.captureStream(30);
    const recordingStream = new MediaStream();
    
    canvasStream.getVideoTracks().forEach(track => recordingStream.addTrack(track));
    if (mainStream && mainStream.getAudioTracks().length > 0) {
        mainStream.getAudioTracks().forEach(track => recordingStream.addTrack(track));
    }

    let options = { mimeType: 'video/webm;codecs=vp9,opus' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm' };
    }

    recorder = new MediaRecorder(recordingStream, options);
    recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    recorder.onstop = () => {
        cancelAnimationFrame(drawLoopID);
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        downloadContainer.innerHTML = `<a href="${url}" download="video_${Date.now()}.mp4" class="download-link-style">📥 動画を保存</a>`;
    };

    recorder.start(1000);
    recordStartBtn.disabled = true;
    recordStopBtn.disabled = false;
};

recordStopBtn.onclick = () => {
    recorder.stop();
    recordStartBtn.disabled = false;
    recordStopBtn.disabled = true;
};

// 5. 写真
photoBtn.onclick = () => {
    drawCanvas();
    const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.9);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `snapshot_${Date.now()}.jpg`;
    link.click();
    if (!recordStartBtn.disabled) cancelAnimationFrame(drawLoopID);
};

setupCamera();