export function getSensorModalHtml(): string {
  return `
  <!-- Add Sensor Modal -->
  <div id="sensor-modal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden items-center justify-center p-4">
    <div class="glass-panel bg-stone-925 p-6 rounded-2xl max-w-md w-full border border-stone-800 space-y-4">
      <div class="flex justify-between items-center border-b border-stone-800 pb-3">
        <h3 class="text-base font-bold text-white">Attach Sensor to GPIO</h3>
        <button onclick="closeAddSensorModal()" class="text-stone-400 hover:text-white">&times;</button>
      </div>

      <form id="sensor-form" onsubmit="handleSaveSensor(event)" class="space-y-3.5 text-xs font-medium">
        <div>
          <label class="block text-stone-400 mb-1">Citadel Room (Supabase Sync)</label>
          <select id="modal-sensor-room" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500">
            <!-- Populated dynamically from state.rooms -->
          </select>
          <p class="text-[10px] text-stone-500 mt-1">Assigning a room automatically links and updates this GPIO pin in Supabase.</p>
        </div>

        <div>
          <label class="block text-stone-400 mb-1">Sensor Name</label>
          <input id="modal-sensor-name" required type="text" placeholder="e.g. Master Bedroom Temp" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500">
        </div>

        <div>
          <label class="block text-stone-400 mb-1">Sensor Type</label>
          <select id="modal-sensor-type" onchange="handleTypeChange()" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500">
            <option value="relay">12V Light Switch Relay (Active-Low)</option>
            <option value="temperature">Temperature &amp; Humidity (DHT11/DHT22/DS18B20)</option>
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
          <input id="modal-poll-interval" type="number" value="2500" min="0" step="500" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500">
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-stone-800">
          <button type="button" onclick="closeAddSensorModal()" class="px-4 py-2 rounded-xl text-stone-400 hover:text-white bg-stone-900 border border-stone-800">Cancel</button>
          <button type="submit" class="px-4 py-2 rounded-xl font-bold text-black bg-amber-500 hover:bg-amber-400">Save &amp; Attach to Supabase</button>
        </div>
      </form>
    </div>
  </div>`;
}

export function getPinDetailsModalHtml(): string {
  return `
  <!-- Pin & Sensor Inspection Modal -->
  <div id="pin-details-modal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden items-center justify-center p-4">
    <div class="glass-panel bg-stone-925 p-6 rounded-2xl max-w-md w-full border border-stone-800 space-y-4">
      <div class="flex justify-between items-center border-b border-stone-800 pb-3">
        <h3 id="pindet-title" class="text-base font-bold text-white flex items-center gap-2">
          <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
          </svg>
          Pin Inspector
        </h3>
        <button onclick="closePinDetailsModal()" class="text-stone-400 hover:text-white text-lg font-bold">&times;</button>
      </div>

      <div class="space-y-2.5 text-xs font-mono">
        <div class="p-3 bg-stone-950/80 rounded-xl border border-stone-850 space-y-1">
          <div class="text-[10px] text-stone-500 uppercase">Attached Sensor / Actuator</div>
          <div id="pindet-name" class="font-bold text-white text-sm">--</div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div class="p-3 bg-stone-950/80 rounded-xl border border-stone-850">
            <div class="text-[10px] text-stone-500 uppercase">Supabase Room</div>
            <div id="pindet-room" class="font-bold text-amber-400 truncate mt-0.5">--</div>
          </div>
          <div class="p-3 bg-stone-950/80 rounded-xl border border-stone-850">
            <div class="text-[10px] text-stone-500 uppercase">Sensor Type</div>
            <div id="pindet-type" class="font-bold text-sky-400 truncate mt-0.5">--</div>
          </div>
        </div>

        <div class="p-2.5 bg-stone-950/50 rounded-xl border border-stone-850 flex justify-between items-center text-[10px]">
          <span class="text-stone-400">Assignment Source</span>
          <span id="pindet-source" class="font-bold text-emerald-400">SUPABASE CLOUD</span>
        </div>
      </div>

      <div class="flex justify-between items-center pt-3 border-t border-stone-800">
        <button id="pindet-unassign-btn" class="px-3 py-1.5 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30 text-xs hidden">
          Unassign from Supabase
        </button>
        <div class="flex gap-2 ml-auto">
          <button type="button" onclick="closePinDetailsModal()" class="px-4 py-1.5 rounded-xl text-stone-400 hover:text-white bg-stone-900 border border-stone-800 text-xs">Close</button>
          <button id="pindet-action-btn" class="px-4 py-1.5 rounded-xl font-bold text-black bg-amber-500 hover:bg-amber-400 text-xs hidden">Action</button>
        </div>
      </div>
    </div>
  </div>`;
}

export function getEnrollFaceModalHtml(): string {
  return `
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

        <div id="photo-preview-grid" class="grid grid-cols-5 gap-1.5 max-h-32 overflow-y-auto p-2 bg-stone-950/60 rounded-xl border border-stone-855">
          <!-- Thumbnail previews -->
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-stone-800">
          <button type="button" onclick="closeEnrollFaceModal()" class="px-4 py-2 rounded-xl text-stone-400 hover:text-white bg-stone-900 border border-stone-800">Cancel</button>
          <button id="train-submit-btn" type="submit" class="px-4 py-2 rounded-xl font-bold text-black bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed">Train AI Model</button>
        </div>
      </form>
    </div>
  </div>`;
}

export function getTokenModalHtml(): string {
  return `
  <!-- Smarter Home Permanent Token Modal -->
  <div id="token-modal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden items-center justify-center p-4">
    <div class="glass-panel bg-stone-925 p-6 rounded-2xl max-w-md w-full border border-stone-800 space-y-4">
      <div class="flex justify-between items-center border-b border-stone-800 pb-3">
        <h3 class="text-base font-bold text-white flex items-center gap-2">
          <svg class="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
          </svg>
          Link to Smarter Home
        </h3>
        <button onclick="closeTokenModal()" class="text-stone-400 hover:text-white">&times;</button>
      </div>

      <form id="token-form" onsubmit="handleSaveToken(event)" class="space-y-3.5 text-xs font-medium">
        <div>
          <label class="block text-stone-400 mb-1">Permanent Home Token</label>
          <input id="modal-cloud-token" required type="text" placeholder="e.g. smp_live_abcdef123456..." class="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-sky-500">
          <p class="text-[10px] text-stone-500 mt-1">Generated from your Smarter Home Settings &gt; Raspberry Pi &amp; Camera Linking section.</p>
        </div>

        <div>
          <label class="block text-stone-400 mb-1">Smarter Home URL</label>
          <input id="modal-cloud-url" type="url" placeholder="http://localhost:3000" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-sky-500">
        </div>

        <div class="flex items-center justify-between pt-3 border-t border-stone-800">
          <button type="button" onclick="handleClearToken()" class="px-3 py-2 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 text-xs">Unlink</button>
          <div class="flex gap-2">
            <button type="button" onclick="closeTokenModal()" class="px-4 py-2 rounded-xl text-stone-400 hover:text-white bg-stone-900 border border-stone-800">Cancel</button>
            <button id="token-save-btn" type="submit" class="px-4 py-2 rounded-xl font-bold text-black bg-sky-400 hover:bg-sky-300">Save &amp; Link</button>
          </div>
        </div>
      </form>
    </div>
  </div>`;
}
