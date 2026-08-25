export const cameraScript = `
    const canvas = document.getElementById('live-video-canvas');
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let isWebcamActive = false;
    let webcamStream = null;
    let isStreamLoaded = false;
    let lastWebcamUpload = 0;

    async function initAutoWebcam() {
      const video = document.getElementById('webcam-video');
      const hudLabel = document.getElementById('cam-hud-label');

      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          webcamStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }
          });
          video.srcObject = webcamStream;
          await video.play();
          isWebcamActive = true;
          if (hudLabel) hudLabel.textContent = 'LIVE CAMERA • AI FACE ID ACTIVE';
          document.getElementById('cam-fps-badge').textContent = '640x480 • 30 FPS • WEBCAM + AI';
        }
      } catch (err) {
        isWebcamActive = false;
      }
    }

    function handleStreamLoad() {
      isStreamLoaded = true;
      document.getElementById('cam-fps-badge').textContent = '640x480 • 30 FPS • PROCESSED STREAM';
    }

    function handleStreamError(img) {
      isStreamLoaded = false;
      document.getElementById('cam-fps-badge').textContent = '640x480 • 30 FPS • ACTIVE FEED';
      setTimeout(() => {
        if (!isWebcamActive) {
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
      let t = 0;
      const video = document.getElementById('webcam-video');
      const streamImg = document.getElementById('camera-mjpeg-stream');

      function render() {
        t += 0.035;
        const now = new Date();
        const timecode = now.toTimeString().split(' ')[0] + '.' + String(Math.floor(now.getMilliseconds() / 100));
        document.getElementById('canvas-timecode').textContent = timecode;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (isWebcamActive && video.readyState >= 2) {
          streamImg.classList.add('hidden');
          // Draw real local webcam frame
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          captureAndSendWebcamFrame(video);
        } else if (!isStreamLoaded) {
          streamImg.classList.remove('hidden');
          // Render simulation backdrop if physical camera is offline
          const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
          bgGrad.addColorStop(0, '#1c1917');
          bgGrad.addColorStop(0.65, '#292524');
          bgGrad.addColorStop(1, '#0c0a09');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Foyer light cone
          const lightGrad = ctx.createRadialGradient(canvas.width / 2, 40, 10, canvas.width / 2, 260, 360);
          lightGrad.addColorStop(0, 'rgba(254, 243, 199, 0.22)');
          lightGrad.addColorStop(0.5, 'rgba(251, 191, 36, 0.08)');
          lightGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = lightGrad;
          ctx.beginPath();
          ctx.moveTo(canvas.width / 2 - 120, 0);
          ctx.lineTo(canvas.width / 2 + 120, 0);
          ctx.lineTo(canvas.width, canvas.height);
          ctx.lineTo(0, canvas.height);
          ctx.closePath();
          ctx.fill();

          // Door & Archway
          ctx.fillStyle = '#141210';
          ctx.fillRect(canvas.width / 2 - 110, 60, 220, 320);
          ctx.strokeStyle = '#44403c';
          ctx.lineWidth = 3;
          ctx.strokeRect(canvas.width / 2 - 110, 60, 220, 320);

          // Render person silhouette if detected
          const det = state.currentFaceDetection;
          if (det && det.detected) {
            const isRec = det.status === 'recognized';
            const sway = Math.sin(t) * 6;
            const px = canvas.width / 2 + sway;
            const py = 150 + Math.cos(t * 0.8) * 4;

            ctx.fillStyle = isRec ? '#1e293b' : '#3f3f46';
            ctx.beginPath();
            ctx.ellipse(px, py + 140, 75, 100, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = isRec ? '#fed7aa' : '#cbd5e1';
            ctx.beginPath();
            ctx.ellipse(px, py + 25, 45, 55, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
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
`;
