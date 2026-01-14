const video = document.getElementById('preview');
const stopwatchDisplay = document.getElementById('stopwatch-display');

const timerStartBtn = document.getElementById('timerStartBtn');
const timerStopBtn = document.getElementById('timerStopBtn');
const timerResetBtn = document.getElementById('timerResetBtn');
const recordStartBtn = document.getElementById('recordStartBtn');
const recordStopBtn = document.getElementById('recordStopBtn');
const photoBtn = document.getElementById('photoBtn');
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

// カメラとマイクのストリームを保持
let mainStream = null;

/**
 * 1. カメラとマイクの初期化
 */
async function setupCamera() {
    try {
        mainStream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 1280, height: 720 }, 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } 
        });
        video.srcObject = mainStream;
        video.onloadedmetadata = () => {
            video.play();
            captureCanvas.width = video.videoWidth;
            captureCanvas.height = video.videoHeight;
        };
    } catch (err) {
        console.error("Camera/Mic Error:", err);
        alert("カメラまたはマイクの起動に失敗しました。権限を許可してください。");
    }
}

/**
 * 2. 合成描画ループ
 */
function drawCanvas() {
    ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    
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
 * 4. 録画（確実な音声合成）
 */
recordStartBtn.onclick = () => {
    recordedChunks = [];
    drawCanvas(); 
    
    // Canvasからの映像ストリーム (30fps)
    const canvasStream = captureCanvas.captureStream(30);
    
    // 録画用ストリームを作成
    const recordingStream = new MediaStream();
    
    // 映像トラックを追加
    canvasStream.getVideoTracks().forEach(track => recordingStream.addTrack(track));
    
    // 音声トラックを直接メインストリームから取得して追加
    if (mainStream && mainStream.getAudioTracks().length > 0) {
        mainStream.getAudioTracks().forEach(track => {
            recordingStream.addTrack(track);
            console.log("Audio track added:", track.label);
        });
    } else {
        alert("マイク音声が検出できません。録画を中止します。");
        return;
    }

    // MIMEタイプの決定
    let options = { mimeType: 'video/webm;codecs=vp9,opus' }; // Opusは音声コーデック
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm' };
    }

    try {
        recorder = new MediaRecorder(recordingStream, options);
    } catch (e) {
        console.error("MediaRecorder error:", e);
        recorder = new MediaRecorder(recordingStream); // デフォルト設定で試行
    }
    
    recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
    };

    recorder.onstop = () => {
        cancelAnimationFrame(drawLoopID);
        const blob = new Blob(recordedChunks, { type: 'video/mp4' }); // ダウンロード時はmp4
        const url = URL.createObjectURL(blob);
        
        downloadContainer.innerHTML = '';
        const a = document.createElement('a');
        a.href = url;
        a.download = `video_${Date.now()}.mp4`;
        a.textContent = '📥 動画をダウンロード';
        a.className = 'download-link-style'; 
        downloadContainer.appendChild(a);
    };

    recorder.start(1000); // 1秒ごとにデータをチャンク化して安定させる
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

setupCamera();