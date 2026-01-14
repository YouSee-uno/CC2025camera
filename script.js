const video = document.getElementById('preview');
const stopwatchDisplay = document.getElementById('stopwatch-display');

const timerStartBtn = document.getElementById('timerStartBtn');
const timerStopBtn = document.getElementById('timerStopBtn');
const timerResetBtn = document.getElementById('timerResetBtn');
const recordStartBtn = document.getElementById('recordStartBtn');
const recordStopBtn = document.getElementById('recordStopBtn');
const photoBtn = document.getElementById('photoBtn');
const switchCameraBtn = document.getElementById('switchCameraBtn'); // 切り替えボタン
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
let currentFacingMode = "user"; // "user" は内蔵、"environment" は外側

/**
 * 1. カメラとマイクの初期化（切り替え対応）
 */
async function setupCamera() {
    // 既存のストリームがあれば停止させる（切り替え時の競合防止）
    if (mainStream) {
        mainStream.getTracks().forEach(track => track.stop());
    }

    try {
        const constraints = {
            video: { 
                width: { ideal: 1280 }, 
                height: { ideal: 720 }, 
                facingMode: currentFacingMode 
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true
            }
        };

        mainStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = mainStream;

        video.onloadedmetadata = () => {
            video.play();
            captureCanvas.width = video.videoWidth;
            captureCanvas.height = video.videoHeight;
        };
    } catch (err) {
        console.error("Camera Error:", err);
        alert("カメラの切り替えに失敗しました。デバイスが対応していない可能性があります。");
    }
}

/**
 * カメラの切り替えイベント
 */
switchCameraBtn.onclick = () => {
    // 録画中は切り替え不可
    if (recorder && recorder.state === "recording") {
        alert("録画中はカメラを切り替えられません。");
        return;
    }
    // モードを反転
    currentFacingMode = (currentFacingMode === "user") ? "environment" : "user";
    setupCamera();
};

/**
 * 2. 合成描画ループ（タイマー焼き込み）
 */
function drawCanvas() {
    // 左右反転の処理（内カメラの時だけ鏡像にする場合はここで処理可能）
    ctx.save();
    ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    ctx.restore();
    
    const timerText = stopwatchDisplay.textContent;
    ctx.font = "bold 60px 'BIZ UDGothic'";
    const x = 40;
    const y = 90;

    // 白縁取り
    ctx.strokeStyle = "white";
    ctx.lineWidth = 10;
    ctx.lineJoin = "round";
    ctx.strokeText(timerText, x, y);
    
    // 黒文字
    ctx.fillStyle = "black";
    ctx.fillText(timerText, x, y);

    drawLoopID = requestAnimationFrame(drawCanvas);
}

/**
 * 3. タイマー制御
 */
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

/**
 * 4. 録画
 */
recordStartBtn.onclick = () => {
    recordedChunks = [];
    drawCanvas(); 
    
    const canvasStream = captureCanvas.captureStream(30);
    const recordingStream = new MediaStream();
    
    // 映像トラック
    canvasStream.getVideoTracks().forEach(track => recordingStream.addTrack(track));
    
    // 音声トラック（メインストリームから直接追加して音質を確保）
    if (mainStream && mainStream.getAudioTracks().length > 0) {
        mainStream.getAudioTracks().forEach(track => recordingStream.addTrack(track));
    }

    let options = { mimeType: 'video/webm;codecs=vp9,opus' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm' };
    }

    recorder = new MediaRecorder(recordingStream, options);
    
    recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
    };

    recorder.onstop = () => {
        cancelAnimationFrame(drawLoopID);
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        
        downloadContainer.innerHTML = '';
        const a = document.createElement('a');
        a.href = url;
        a.download = `video_${Date.now()}.mp4`; // ダウンロード名はmp4
        a.textContent = '📥 音声入りタイマー動画を保存';
        a.className = 'download-link-style'; 
        downloadContainer.appendChild(a);
    };

    recorder.start(1000);
    recordStartBtn.disabled = true;
    recordStopBtn.disabled = false;
};

recordStopBtn.onclick = () => {
    if (recorder && recorder.state !== "inactive") {
        recorder.stop();
        recordStartBtn.disabled = false;
        recordStopBtn.disabled = true;
    }
};

/**
 * 5. 写真撮影
 */
photoBtn.onclick = () => {
    drawCanvas();
    const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.9);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `snapshot_${Date.now()}.jpg`;
    link.click();
    if (!recordStartBtn.disabled) cancelAnimationFrame(drawLoopID);
};

// 起動
setupCamera();