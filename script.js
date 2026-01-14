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

// 録画合成用Canvas
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

/**
 * 1. カメラ初期化
 */
async function setupCamera() {
    if (mainStream) {
        mainStream.getTracks().forEach(track => track.stop());
    }

    const constraints = {
        video: { 
            facingMode: currentFacingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 } // フレームレートを30に固定して安定させる
        },
        audio: true
    };

    try {
        mainStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = mainStream;
        
        // 内側カメラの場合は鏡像表示（CSSのみで処理して負荷軽減）
        if (currentFacingMode === "user") {
            video.style.transform = "scaleX(-1)";
        } else {
            video.style.transform = "scaleX(1)";
        }

        video.onloadedmetadata = () => {
            video.play();
            // Canvasサイズを確定
            captureCanvas.width = video.videoWidth;
            captureCanvas.height = video.videoHeight;
        };
    } catch (err) {
        alert("カメラの切り替えに失敗しました。");
    }
}

/**
 * 2. 録画・撮影用の合成描画ループ
 * 負荷軽減のため、必要な時だけ呼び出すように最適化
 */
function drawCanvasLoop() {
    if (!recorder || recorder.state === "inactive") return;

    // 映像の描画
    ctx.save();
    if (currentFacingMode === "user") {
        ctx.translate(captureCanvas.width, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    ctx.restore();
    
    // タイマー描画（白縁取り＋黒文字）
    const timerText = stopwatchDisplay.textContent;
    ctx.font = "bold 60px 'BIZ UDGothic'";
    ctx.textAlign = "left";
    const x = 40;
    const y = 90;

    ctx.strokeStyle = "white";
    ctx.lineWidth = 10;
    ctx.lineJoin = "round";
    ctx.strokeText(timerText, x, y);
    ctx.fillStyle = "black";
    ctx.fillText(timerText, x, y);

    drawLoopID = requestAnimationFrame(drawCanvasLoop);
}

/**
 * 3. タイマー制御（描画とロジックを分離）
 */
function updateTimer() {
    if (!timerRunning) return;
    
    const now = Date.now();
    const diff = now - timerStartTime + elapsedTime;
    
    const m = String(Math.floor(diff / 60000)).padStart(2, '0');
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    const ms = String(Math.floor((diff % 1000) / 10)).padStart(2, '0');
    
    const newTime = `${m}:${s}.${ms}`;
    
    // 文字列が変わった時だけDOMを更新して負荷を下げる
    if (stopwatchDisplay.textContent !== newTime) {
        stopwatchDisplay.textContent = newTime;
    }
    
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
 * 4. 録画処理（負荷軽減版）
 */
recordStartBtn.onclick = () => {
    recordedChunks = [];
    
    // Canvas描画ループ開始
    drawCanvasLoop(); 
    
    // Canvasから映像取得（FPSを30に制限して安定させる）
    const canvasStream = captureCanvas.captureStream(30);
    const recordingStream = new MediaStream();
    
    canvasStream.getVideoTracks().forEach(track => recordingStream.addTrack(track));
    if (mainStream && mainStream.getAudioTracks().length > 0) {
        mainStream.getAudioTracks().forEach(track => recordingStream.addTrack(track));
    }

    // コーデック設定
    let options = { mimeType: 'video/webm;codecs=vp8,opus' }; // vp9より負荷の低いvp8を選択
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

    recorder.start(1000); // 1秒ごとにデータを確定させて処理を分散
    recordStartBtn.disabled = true;
    recordStopBtn.disabled = false;
};

recordStopBtn.onclick = () => {
    if (recorder) recorder.stop();
    recordStartBtn.disabled = false;
    recordStopBtn.disabled = true;
};

/**
 * 5. カメラ切り替え
 */
switchCameraBtn.onclick = async () => {
    if (recorder && recorder.state === "recording") return;
    currentFacingMode = (currentFacingMode === "user") ? "environment" : "user";
    await setupCamera();
};

/**
 * 6. 写真撮影
 */
photoBtn.onclick = () => {
    // 録画中でない場合は一度だけ描画
    if (!recorder || recorder.state === "inactive") {
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
        ctx.strokeText(timerText, 40, 90);
        ctx.fillStyle = "black";
        ctx.fillText(timerText, 40, 90);
    }
    
    const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.85);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `snapshot_${Date.now()}.jpg`;
    link.click();
};

setupCamera();