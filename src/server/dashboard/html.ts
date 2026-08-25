export function getDashboardHtmlTemplate(script: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smarter Home Pi - Sensor Controller</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['"Plus Jakarta Sans"', 'sans-serif'],
            mono: ['"JetBrains Mono"', 'monospace'],
          },
          colors: {
            stone: {
              850: '#1f1c1a',
              925: '#141210',
              950: '#0c0a09',
              955: '#090807'
            }
          }
        }
      }
    }
  </script>
  <style>
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #0c0a09; }
    ::-webkit-scrollbar-thumb { background: #27272a; border-radius: 3px; }
    .glass-panel {
      background: rgba(20, 18, 16, 0.7);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.07);
    }
    .pin-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      transition: all 0.2s ease;
    }
    .pin-row:hover .pin-dot {
      transform: scale(1.25);
      box-shadow: 0 0 10px currentColor;
    }
    @keyframes pulseSlow {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .pulse-slow { animation: pulseSlow 2.5s infinite; }
  </style>
</head>
<body class="bg-[#090807] text-stone-300 font-sans min-h-screen antialiased selection:bg-amber-500/30 selection:text-amber-200">

  <!-- Background decorative glows -->
  <div class="fixed top-0 left-1/4 w-[600px] h-[600px] bg-amber-500/[0.025] rounded-full blur-[140px] pointer-events-none"></div>
  <div class="fixed bottom-0 right-1/4 w-[500px] h-[500px] bg-sky-500/[0.02] rounded-full blur-[130px] pointer-events-none"></div>

  <div class="relative z-10 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

    <!-- Top Bar -->
    <header class="glass-panel p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div class="flex items-center gap-3.5">
        <div class="w-11 h-11 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-500 border border-amber-400/30 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.25)]">
          <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path>
          </svg>
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-extrabold text-white tracking-wide">Smarter Home Pi</h1>
            <span id="hw-badge" class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold uppercase tracking-wider">
              HARDWARE
            </span>
          </div>
          <p class="text-xs text-stone-400 font-medium">Raspberry Pi Sensor Controller & Face Recognition Hub</p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-stone-900/60 border border-stone-800 text-xs font-mono">
          <span class="w-2 h-2 rounded-full bg-emerald-400 pulse-slow"></span>
          <span class="text-stone-400">Sync:</span>
          <span id="sync-status-text" class="text-stone-200 font-bold">Active</span>
        </div>
        <button onclick="triggerManualSync()" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 active:scale-95 transition-all">
          Sync Now
        </button>
        <button onclick="openAddSensorModal()" class="px-4 py-1.5 rounded-xl text-xs font-extrabold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black shadow-lg shadow-amber-500/15 active:scale-95 transition-all">
          + Add Sensor
        </button>
      </div>
    </header>

    <!-- Main Bento Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">

      <!-- Left: Interactive 40-Pin Header Visualizer (5 Cols) -->
      <section class="lg:col-span-5 glass-panel p-6 rounded-2xl flex flex-col space-y-5">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-base font-bold text-white flex items-center gap-2">
              <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
              </svg>
              Raspberry Pi 40-Pin Header
            </h2>
            <p class="text-[11px] text-stone-400">Click any available GPIO pin to attach a sensor</p>
          </div>
          <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-800/80 text-stone-400">GPIO.BCM</span>
        </div>

        <!-- Legend -->
        <div class="flex flex-wrap gap-3 text-[10px] font-semibold text-stone-400 pt-1 pb-2 border-b border-stone-800">
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>5V</span>
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-orange-400"></span>3.3V</span>
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-stone-600"></span>GND</span>
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>GPIO</span>
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-amber-400"></span>Assigned</span>
        </div>

        <!-- Pin Header Board -->
        <div class="flex-1 bg-stone-950/80 border border-stone-850 rounded-xl p-3 max-h-[580px] overflow-y-auto font-mono text-xs">
          <div id="pin-header-container" class="space-y-1.5">
            <!-- Rendered by JS -->
          </div>
        </div>
      </section>

      <!-- Right: Live Telemetry & Face Detection Stream (7 Cols) -->
      <section class="lg:col-span-7 space-y-6">

        <!-- Facial Recognition Camera Card -->
        <div class="glass-panel p-6 rounded-2xl space-y-4 relative overflow-hidden">
          <div class="flex flex-wrap justify-between items-center gap-2">
            <div class="flex items-center gap-2.5">
              <div class="w-3 h-3 rounded-full bg-emerald-400 animate-ping"></div>
              <h2 class="text-base font-bold text-white">Live Camera & Facial Recognition</h2>
            </div>
            
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                ALWAYS LIVE
              </span>
              <span id="face-state-badge" class="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-stone-800 text-stone-400 uppercase tracking-wide">
                MONITORING
              </span>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <!-- Real Raspberry Pi Camera MJPEG Stream with Dynamic Face Bounding Box Overlay -->
            <div class="relative aspect-video bg-stone-950 rounded-xl border border-stone-800 overflow-hidden flex items-center justify-center group shadow-2xl">
              <!-- Live Hardware MJPEG Video Feed -->
              <img id="camera-mjpeg-stream" src="/api/camera/stream" alt="" class="absolute inset-0 w-full h-full object-cover transition-opacity duration-300 opacity-0" onerror="this.style.opacity='0'; handleStreamError(this)" onload="this.style.opacity='1'; handleStreamLoad()" />
              <video id="webcam-video" autoplay playsinline muted class="hidden"></video>
              <canvas id="live-video-canvas" width="640" height="480" class="absolute inset-0 w-full h-full object-cover pointer-events-none"></canvas>
              
              <!-- Live HUD overlay -->
              <div class="absolute top-2.5 left-3 flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/75 backdrop-blur-md border border-white/10 text-[9px] font-mono text-emerald-400 font-bold z-10">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span id="cam-hud-label">RPi CAMERA (CSI/USB) • LIVE FEED</span>
              </div>

              <div class="absolute top-2.5 right-3 px-2 py-0.5 rounded bg-black/75 backdrop-blur-md border border-white/10 text-[9px] font-mono text-stone-300 z-10">
                <span id="canvas-timecode">--:--:--</span>
              </div>

              <div class="absolute bottom-2.5 left-3 px-2 py-0.5 rounded bg-black/75 backdrop-blur-md border border-white/10 text-[8.5px] font-mono text-stone-400 z-10">
                <span id="cam-fps-badge">640x480 • 15 FPS • HARDWARE</span>
              </div>
            </div>

            <!-- Face Detection Telemetry Data -->
            <div class="space-y-3 bg-stone-950/40 border border-stone-850 p-4 rounded-xl text-xs font-mono">
              <div class="flex justify-between border-b border-stone-800 pb-2">
                <span class="text-stone-400">Face Detected:</span>
                <span id="det-detected" class="font-bold text-stone-200">No</span>
              </div>
              <div class="flex justify-between border-b border-stone-800 pb-2">
                <span class="text-stone-400">Match Status:</span>
                <span id="det-status" class="font-bold text-stone-200">none</span>
              </div>
              <div class="flex justify-between border-b border-stone-800 pb-2">
                <span class="text-stone-400">Identified Person:</span>
                <span id="det-person" class="font-bold text-amber-400">None</span>
              </div>
              <div class="flex justify-between border-b border-stone-800 pb-2">
                <span class="text-stone-400">Confidence Score:</span>
                <span id="det-confidence" class="font-bold text-stone-200">0.0%</span>
              </div>
              <div class="flex justify-between">
                <span class="text-stone-400">Last Event Time:</span>
                <span id="det-time" class="text-[10px] text-stone-400">--:--:--</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Temperature & Environment Sensor Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          <div class="glass-panel p-5 rounded-2xl space-y-2">
            <div class="flex justify-between items-center text-xs text-stone-400 font-bold uppercase tracking-wider">
              <span>Ambient Temperature</span>
              <span class="text-amber-400">DHT22</span>
            </div>
            <div class="flex items-baseline gap-2">
              <span id="temp-val" class="text-4xl font-extrabold text-white font-mono">22.5</span>
              <span class="text-lg font-bold text-stone-400">°C</span>
              <span id="temp-val-f" class="text-sm font-mono text-stone-400 ml-auto">72.5 °F</span>
            </div>
            <div class="w-full bg-stone-900 rounded-full h-1.5 overflow-hidden mt-2">
              <div id="temp-bar" class="bg-gradient-to-r from-sky-400 to-amber-500 h-full w-[55%]"></div>
            </div>
          </div>

          <div class="glass-panel p-5 rounded-2xl space-y-2">
            <div class="flex justify-between items-center text-xs text-stone-400 font-bold uppercase tracking-wider">
              <span>Relative Humidity</span>
              <span class="text-sky-400">1-Wire</span>
            </div>
            <div class="flex items-baseline gap-2">
              <span id="hum-val" class="text-4xl font-extrabold text-white font-mono">50.0</span>
              <span class="text-lg font-bold text-stone-400">%</span>
              <span class="text-xs font-mono text-emerald-400 ml-auto font-bold">OPTIMAL</span>
            </div>
            <div class="w-full bg-stone-900 rounded-full h-1.5 overflow-hidden mt-2">
              <div id="hum-bar" class="bg-gradient-to-r from-emerald-400 to-teal-500 h-full w-[50%]"></div>
            </div>
          </div>

        </div>

        <!-- Enrolled Household Profiles for Face Recognition -->
        <div class="glass-panel p-5 rounded-2xl space-y-4">
          <div class="flex justify-between items-center">
            <h3 class="text-sm font-bold text-white flex items-center gap-2">
              <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
              </svg>
              Enrolled Face Profiles
            </h3>
            <button onclick="openEnrollFaceModal()" class="px-3 py-1 text-xs font-bold rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 active:scale-95 transition-all">
              + Enroll Person
            </button>
          </div>
          <div id="enrolled-faces-list" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <!-- Rendered by JS -->
          </div>
        </div>

      </section>

    </div>
  </div>

  <!-- Add Sensor Modal -->
  <div id="sensor-modal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden items-center justify-center p-4">
    <div class="glass-panel bg-stone-925 p-6 rounded-2xl max-w-md w-full border border-stone-800 space-y-4">
      <div class="flex justify-between items-center border-b border-stone-800 pb-3">
        <h3 class="text-base font-bold text-white">Attach Sensor to GPIO</h3>
        <button onclick="closeAddSensorModal()" class="text-stone-400 hover:text-white">&times;</button>
      </div>

      <form id="sensor-form" onsubmit="handleSaveSensor(event)" class="space-y-3.5 text-xs font-medium">
        <div>
          <label class="block text-stone-400 mb-1">Sensor Name</label>
          <input id="modal-sensor-name" required type="text" placeholder="e.g. Master Bedroom Temp" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500">
        </div>

        <div>
          <label class="block text-stone-400 mb-1">Sensor Type</label>
          <select id="modal-sensor-type" onchange="handleTypeChange()" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500">
            <option value="temperature">Temperature & Humidity (DHT11/DHT22/DS18B20)</option>
            <option value="camera">Camera with Face Recognition (CSI/USB)</option>
            <option value="motion">PIR Motion Detector</option>
            <option value="door">Door / Window Magnetic Reed Switch</option>
            <option value="gas">MQ2 Gas / Smoke Sensor</option>
          </select>
        </div>

        <div id="modal-pin-group">
          <label class="block text-stone-400 mb-1">GPIO Pin Assignment</label>
          <select id="modal-sensor-pin" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500">
            <!-- Populated dynamically -->
          </select>
        </div>

        <div>
          <label class="block text-stone-400 mb-1">Sampling Interval (ms)</label>
          <input id="modal-poll-interval" type="number" value="2500" min="500" step="500" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500">
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-stone-800">
          <button type="button" onclick="closeAddSensorModal()" class="px-4 py-2 rounded-xl text-stone-400 hover:text-white bg-stone-900 border border-stone-800">Cancel</button>
          <button type="submit" class="px-4 py-2 rounded-xl font-bold text-black bg-amber-500 hover:bg-amber-400">Save & Attach</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Enroll & Train Face Modal (10+ photos) -->
  <div id="enroll-modal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden items-center justify-center p-4">
    <div class="glass-panel bg-stone-925 p-6 rounded-2xl max-w-lg w-full border border-stone-800 space-y-4">
      <div class="flex justify-between items-center border-b border-stone-800 pb-3">
        <h3 class="text-base font-bold text-white">Train Family Member Face Model</h3>
        <button onclick="closeEnrollFaceModal()" class="text-stone-400 hover:text-white">&times;</button>
      </div>

      <form id="enroll-form" onsubmit="handleTrainFace(event)" class="space-y-3.5 text-xs font-medium">
        <div>
          <label class="block text-stone-400 mb-1">Full Name</label>
          <input id="modal-face-name" required type="text" placeholder="e.g. Angelo" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500">
        </div>
        <div>
          <label class="block text-stone-400 mb-1">Role / Relationship</label>
          <input id="modal-face-notes" type="text" placeholder="e.g. Homeowner / Resident" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500">
        </div>

        <div>
          <div class="flex justify-between items-center mb-1">
            <label class="block text-stone-400">Reference Photos (Minimum 10 Required)</label>
            <span id="photo-count-badge" class="font-mono text-[10px] text-amber-400 font-bold">0 / 10 Selected</span>
          </div>
          <input id="modal-face-files" type="file" multiple accept="image/*" onchange="handlePhotoSelection(event)" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-500/20 file:text-emerald-400 hover:file:bg-emerald-500/30 cursor-pointer">
          <p class="text-[10px] text-stone-500 mt-1">Upload at least 10 photos in varied lighting, angles, and expressions for highest accuracy.</p>
        </div>

        <div id="photo-preview-grid" class="grid grid-cols-5 gap-1.5 max-h-32 overflow-y-auto p-2 bg-stone-950/60 rounded-xl border border-stone-850">
          <!-- Thumbnail previews -->
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-stone-800">
          <button type="button" onclick="closeEnrollFaceModal()" class="px-4 py-2 rounded-xl text-stone-400 hover:text-white bg-stone-900 border border-stone-800">Cancel</button>
          <button id="train-submit-btn" type="submit" class="px-4 py-2 rounded-xl font-bold text-black bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed">Train AI Model</button>
        </div>
      </form>
    </div>
  </div>

  <script>
    \${script}
  </script>
</body>
</html>
`;
}
