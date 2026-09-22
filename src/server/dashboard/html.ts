import { getAllModalsHtml } from './modals.js';

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
        <button onclick="openTokenModal()" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-500/10 border border-sky-500/30 text-sky-400 hover:bg-sky-500/20 active:scale-95 transition-all flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
          </svg>
          <span id="token-btn-label">Link Home Token</span>
        </button>
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

      <!-- Left: Interactive 40-Pin Header Visualizer & Supabase Sensor Mapping (5 Cols) -->
      <section class="lg:col-span-5 glass-panel p-6 rounded-2xl flex flex-col space-y-4">
        <div class="flex justify-between items-start">
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-base font-bold text-white flex items-center gap-2">
                <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
                </svg>
                Raspberry Pi 40-Pin Header
              </h2>
              <div id="supabase-header-badge" class="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-stone-900 border border-stone-800 text-[10px] font-mono text-stone-400">
                <span class="w-1.5 h-1.5 rounded-full bg-stone-500"></span>
                <span>Connecting...</span>
              </div>
            </div>
            <p class="text-[11px] text-stone-400 mt-0.5">Live hardware pinout synced with Supabase sensors &amp; rooms</p>
          </div>
          <div class="flex items-center gap-1.5">
            <button onclick="syncPinsWithSupabase()" title="Sync sensors and GPIO mappings from Supabase" class="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-stone-800/80 hover:bg-stone-700 text-stone-300 border border-stone-700/60 transition-all flex items-center gap-1.5 active:scale-95">
              <svg id="sync-pins-btn" class="w-3 h-3 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
              <span>Sync Pins</span>
            </button>
            <span class="text-[10px] font-mono px-2 py-1 rounded bg-stone-800/80 text-stone-400 border border-stone-800">BCM</span>
          </div>
        </div>

        <!-- Sensor Legend -->
        <div class="flex flex-wrap gap-2 text-[9px] font-semibold text-stone-400 pt-1 pb-2 border-b border-stone-800">
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-red-500"></span>5V</span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-orange-400"></span>3.3V</span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-stone-600"></span>GND</span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-400"></span>GPIO</span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-amber-400"></span>Light</span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-sky-400"></span>Temp</span>
          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-purple-400"></span>AC</span>
        </div>

        <!-- Pin Header Board -->
        <div class="bg-stone-950/80 border border-stone-850 rounded-xl p-2.5 max-h-[440px] overflow-y-auto font-mono text-xs">
          <div id="pin-header-container" class="space-y-1">
            <!-- Rendered by JS -->
          </div>
        </div>

        <!-- Supabase Synced Sensors & GPIO Map Breakdown -->
        <div class="pt-3 border-t border-stone-850 space-y-2">
          <div class="flex justify-between items-center">
            <h3 class="text-xs font-bold text-white flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
              </svg>
              Supabase Sensor &amp; GPIO Mapping
            </h3>
            <span id="supabase-sensor-count" class="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-900 border border-stone-800 text-amber-400 font-bold">0 Active</span>
          </div>
          <div id="supabase-sensors-list" class="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
            <!-- Rendered by JS -->
          </div>
        </div>
      </section>

      <!-- Right: Live Telemetry & Face Detection Stream (7 Cols) -->
      <section class="lg:col-span-7 space-y-6">

        <!-- AI Face Recognition Status & Detection Telemetry -->
        <div class="glass-panel p-5 rounded-2xl space-y-3">
          <div class="flex flex-wrap justify-between items-center gap-2 border-b border-stone-800 pb-3">
            <div class="flex items-center gap-2.5">
              <div class="w-3 h-3 rounded-full bg-emerald-400 animate-ping"></div>
              <h2 class="text-sm font-bold text-white tracking-wide">AI Facial Recognition Telemetry</h2>
            </div>
            
            <div class="flex items-center gap-2">
              <span id="face-state-badge" class="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-stone-800 text-stone-400 uppercase tracking-wide">
                MONITORING
              </span>
            </div>
          </div>

          <!-- Face Detection Telemetry Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div class="bg-stone-950/60 border border-stone-850 p-3 rounded-xl">
              <span class="text-stone-500 text-[10px] block uppercase">Face Detected</span>
              <span id="det-detected" class="font-bold text-stone-200 text-sm mt-0.5 block">No</span>
              <span id="det-status" class="hidden">none</span>
            </div>
            <div class="bg-stone-950/60 border border-stone-850 p-3 rounded-xl">
              <span class="text-stone-500 text-[10px] block uppercase">Identified Person</span>
              <span id="det-person" class="font-bold text-amber-400 text-sm mt-0.5 block truncate">None</span>
            </div>
            <div class="bg-stone-950/60 border border-stone-850 p-3 rounded-xl">
              <span class="text-stone-500 text-[10px] block uppercase">Confidence</span>
              <span id="det-confidence" class="font-bold text-stone-200 text-sm mt-0.5 block">0.0%</span>
            </div>
            <div class="bg-stone-950/60 border border-stone-850 p-3 rounded-xl">
              <span class="text-stone-500 text-[10px] block uppercase">Last Event</span>
              <span id="det-time" class="font-bold text-stone-400 text-xs mt-1 block">--:--:--</span>
            </div>
          </div>
        </div>

        <!-- Temperature & Environment Sensor Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          <div class="glass-panel p-5 rounded-2xl space-y-2">
            <div class="flex justify-between items-center text-xs text-stone-400 font-bold uppercase tracking-wider">
              <span>Ambient Temperature</span>
              <span id="temp-sensor-badge" class="text-amber-400">DHT22</span>
            </div>
            <div class="flex items-baseline gap-2">
              <span id="temp-val" class="text-4xl font-extrabold text-white font-mono">--</span>
              <span class="text-lg font-bold text-stone-400">°C</span>
              <span id="temp-val-f" class="text-sm font-mono text-stone-400 ml-auto">-- °F</span>
            </div>
            <div class="w-full bg-stone-900 rounded-full h-1.5 overflow-hidden mt-2">
              <div id="temp-bar" class="bg-gradient-to-r from-sky-400 to-amber-500 h-full w-0 transition-all duration-500"></div>
            </div>
            <p id="ambient-room-name" class="text-[10px] text-stone-400 font-mono mt-1 truncate">Checking Supabase...</p>
          </div>

          <div class="glass-panel p-5 rounded-2xl space-y-2">
            <div class="flex justify-between items-center text-xs text-stone-400 font-bold uppercase tracking-wider">
              <span>Relative Humidity</span>
              <span id="hum-sensor-badge" class="text-sky-400">DHT22</span>
            </div>
            <div class="flex items-baseline gap-2">
              <span id="hum-val" class="text-4xl font-extrabold text-white font-mono">--</span>
              <span class="text-lg font-bold text-stone-400">%</span>
              <span id="hum-status-badge" class="text-xs font-mono text-stone-500 ml-auto font-bold">--</span>
            </div>
            <div class="w-full bg-stone-900 rounded-full h-1.5 overflow-hidden mt-2">
              <div id="hum-bar" class="bg-gradient-to-r from-emerald-400 to-teal-500 h-full w-0 transition-all duration-500"></div>
            </div>
            <p id="ambient-hum-source" class="text-[10px] text-stone-400 font-mono mt-1 truncate">Checking Supabase...</p>
          </div>

        </div>

        <!-- Smarter Home Cloud Link & Permanent Token Integration Card -->
        <div class="glass-panel p-5 rounded-2xl space-y-3 border border-sky-500/20 bg-gradient-to-r from-sky-950/20 to-stone-900/40">
          <div class="flex justify-between items-center">
            <div class="flex items-center gap-2.5">
              <div class="p-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
                </svg>
              </div>
              <div>
                <h3 class="text-xs font-bold text-white uppercase tracking-wider">Smarter Home Cloud Link</h3>
                <p id="cloud-link-card-status" class="text-[11px] text-stone-400 font-mono">Checking connection...</p>
              </div>
            </div>
            <button onclick="openTokenModal()" class="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-400 text-black shadow-lg shadow-sky-500/15 active:scale-95 transition-all flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
              </svg>
              <span>Configure Token</span>
            </button>
          </div>
          <div class="flex items-center justify-between text-[10px] font-mono text-stone-500 pt-1 border-t border-stone-850">
            <span>Target Cloud URL: <strong id="cloud-link-target-url" class="text-stone-300">--</strong></span>
            <span>Active Token: <strong id="cloud-link-active-token" class="text-amber-400">None</strong></span>
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

        <!-- Connected Citadel Rooms & Camera Streams -->
        <div class="glass-panel p-5 rounded-2xl space-y-4">
          <div class="flex justify-between items-center">
            <div class="flex items-center gap-2">
              <div class="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
                </svg>
              </div>
              <div>
                <h3 class="text-sm font-bold text-white tracking-wide">Citadel Rooms &amp; RTSP Cameras</h3>
                <p class="text-[11px] text-stone-400">Every synchronized spatial zone and its connected camera stream</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="openCreateRoomModal()" class="px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 active:scale-95 transition-all flex items-center gap-1.5 shadow-sm">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                <span>Add Room</span>
              </button>
              <button onclick="openRoomGpioModal()" class="px-3 py-1.5 text-xs font-bold rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 active:scale-95 transition-all flex items-center gap-1.5 shadow-sm">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                <span>GPIO Pins</span>
              </button>
              <button onclick="fetchRooms()" class="p-1.5 text-xs font-bold rounded-xl bg-stone-850 hover:bg-stone-700 text-stone-300 transition-all flex items-center" title="Refresh Rooms">
                <svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
              </button>
            </div>
          </div>
          <div id="rooms-camera-grid" class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <!-- Rendered by JS -->
          </div>
        </div>

      </section>

    </div>
  </div>

  ${getAllModalsHtml()}

  <script>
    ${script}
  </script>
</body>
</html>
`;
}
