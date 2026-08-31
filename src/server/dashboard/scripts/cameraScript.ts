export const cameraScript = `
    const canvas = document.getElementById('live-video-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    let animationFrameId;
    let isWebcamActive = false;
    let webcamStream = null;
    let isStreamLoaded = false;
    let lastWebcamUpload = 0;

    async function initAutoWebcam() {
      const video = document.getElementById('webcam-video');
      const hudLabel = document.getElementById('cam-hud-label');
      if (!video) return;

      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          webcamStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }
          });
          video.srcObject = webcamStream;
          await video.play();
          isWebcamActive = true;
          if (hudLabel) hudLabel.textContent = 'LIVE CAMERA • AI FACE ID ACTIVE';
          const badge = document.getElementById('cam-fps-badge');
          if (badge) badge.textContent = '640x480 • 30 FPS • WEBCAM + AI';
        }
      } catch (err) {
        isWebcamActive = false;
      }
    }

    function handleStreamLoad() {
      isStreamLoaded = true;
      const hudLabel = document.getElementById('cam-hud-label');
      if (hudLabel) hudLabel.textContent = 'TAPO IP CAMERA (192.168.68.101) • LIVE RTSP';
      const badge = document.getElementById('cam-fps-badge');
      if (badge) badge.textContent = '640x480 • 15 FPS • TAPO RTSP STREAM';
    }

    function handleStreamError(img) {
      isStreamLoaded = false;
      const badge = document.getElementById('cam-fps-badge');
      if (badge) badge.textContent = '640x480 • RECONNECTING TAPO STREAM...';
      setTimeout(() => {
        if (!isWebcamActive && img) {
          img.src = '/api/camera/stream?t=' + Date.now();
        }
      }, 3000);
    }

    function captureAndSendWebcamFrame(video) {
      const now = Date.now();
      if (now - lastWebcamUpload < 350) return; // ~3 FPS upload for real AI recognition
      lastWebcamUpload = now;

      try {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = 320;
        offCanvas.height = 240;
        const offCtx = offCanvas.getContext('2d');
        offCtx.drawImage(video, 0, 0, 320, 240);
        const dataUrl = offCanvas.toDataURL('image/jpeg', 0.6);

        if (window.wsClient && window.wsClient.readyState === WebSocket.OPEN) {
          window.wsClient.send(JSON.stringify({ type: 'camera_frame', image: dataUrl }));
        } else {
          fetch('/api/camera/frame', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: dataUrl })
          }).then(r => r.json()).then(res => {
            if (res.detection) {
              state.currentFaceDetection = res.detection;
              updateFaceDisplay(res.detection);
            }
          }).catch(() => {});
        }
      } catch {}
    }

    function startCanvasRenderLoop() {
      if (!canvas || !ctx) return;
      let t = 0;
      const video = document.getElementById('webcam-video');
      const streamImg = document.getElementById('camera-mjpeg-stream');

      function render() {
        if (!canvas || !ctx) return;
        t += 0.035;
        const now = new Date();
        const timecode = now.toTimeString().split(' ')[0] + '.' + String(Math.floor(now.getMilliseconds() / 100));
        const timeElem = document.getElementById('canvas-timecode');
        if (timeElem) timeElem.textContent = timecode;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (isWebcamActive && video && video.readyState >= 2) {
          if (streamImg) streamImg.classList.add('hidden');
          // Draw real local webcam frame
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          captureAndSendWebcamFrame(video);
        } else if (streamImg) {
          streamImg.classList.remove('hidden');
        }

        // CCTV Scanlines
        ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
        for (let y = 0; y < canvas.height; y += 4) {
          ctx.fillRect(0, y, canvas.width, 1.5);
        }

        // Active Face Recognition Bounding Box & HUD
        const det = state.currentFaceDetection;
        if (det && det.detected) {
          const isRec = det.status === 'recognized';
          const boxColor = isRec ? '#10b981' : '#f59e0b';
          const boxBg = isRec ? 'rgba(16, 185, 129, 0.16)' : 'rgba(245, 158, 11, 0.16)';

          const sway = (isWebcamActive || isStreamLoaded) ? 0 : Math.sin(t) * 6;
          const bx = det.box ? det.box.x : (canvas.width / 2 - 90 + sway);
          const by = det.box ? det.box.y : 120;
          const bw = det.box ? det.box.width : 180;
          const bh = det.box ? det.box.height : 220;

          // Box Fill & Border
          ctx.fillStyle = boxBg;
          ctx.fillRect(bx, by, bw, bh);
          ctx.strokeStyle = boxColor;
          ctx.lineWidth = 2.5;
          ctx.strokeRect(bx, by, bw, bh);

          // Corner Reticles
          const cl = 20;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(bx, by + cl); ctx.lineTo(bx, by); ctx.lineTo(bx + cl, by);
          ctx.moveTo(bx + bw - cl, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + cl);
          ctx.moveTo(bx, by + bh - cl); ctx.lineTo(bx, by + bh); ctx.lineTo(bx + cl, by + bh);
          ctx.moveTo(bx + bw - cl, by + bh); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw, by + bh - cl);
          ctx.stroke();

          // Face landmark points
          ctx.fillStyle = boxColor;
          const cx = bx + bw / 2;
          const cy = by + bh / 2 - 15;
          ctx.fillRect(cx - 30, cy - 15, 5, 5);
          ctx.fillRect(cx + 25, cy - 15, 5, 5);
          ctx.fillRect(cx - 2, cy + 8, 5, 8);
          ctx.fillRect(cx - 20, cy + 32, 40, 3);

          // Name Tag & Accuracy Badge
          const label = isRec ? ((det.person || 'Recognized') + ' (' + Math.round((det.confidence || 0.94) * 100) + '%)') : 'UNKNOWN PERSON [ALERT]';
          ctx.font = 'bold 12px "JetBrains Mono", monospace';
          const textMetrics = ctx.measureText(label);
          const tagW = textMetrics.width + 16;
          const tagH = 24;

          ctx.fillStyle = boxColor;
          ctx.fillRect(bx, by - tagH - 4, tagW, tagH);
          ctx.fillStyle = '#000000';
          ctx.fillText(label, bx + 8, by - 8);
        }

        animationFrameId = requestAnimationFrame(render);
      }
      render();
    }

    window.handleStreamLoad = handleStreamLoad;
    window.handleStreamError = handleStreamError;
    window.initAutoWebcam = initAutoWebcam;
    window.startCanvasRenderLoop = startCanvasRenderLoop;
`;
