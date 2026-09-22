export function getRoomGpioModalHtml(): string {
  return `
  <!-- Room GPIO & Sensors Configuration Modal -->
  <div id="room-gpio-modal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden items-center justify-center p-4">
    <div class="glass-panel bg-stone-925 p-6 rounded-2xl max-w-md w-full border border-stone-800 space-y-4">
      <div class="flex justify-between items-center border-b border-stone-800 pb-3">
        <div>
          <h3 class="text-base font-bold text-white flex items-center gap-2">
            <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path>
            </svg>
            Room Sensor &amp; GPIO Configuration
          </h3>
          <p id="room-gpio-subtitle" class="text-[11px] text-stone-400 mt-0.5">Assign hardware sensors to Supabase Citadel room</p>
        </div>
        <button onclick="closeRoomGpioModal()" class="text-stone-400 hover:text-white text-lg font-bold">&times;</button>
      </div>

      <form id="room-gpio-form" onsubmit="handleSaveRoomGpio(event)" class="space-y-3.5 text-xs font-medium">
        <input type="hidden" id="room-gpio-room-id" value="">

        <div>
          <label class="block text-stone-400 mb-1">Target Citadel Room</label>
          <select id="room-gpio-room-select" onchange="handleRoomSelectChange()" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-amber-500">
            <!-- Populated from state.rooms -->
          </select>
        </div>

        <div>
          <div class="flex justify-between items-center mb-1">
            <label class="text-stone-400 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-amber-400"></span>
              12V Lighting Switch Relay (GPIO)
            </label>
            <span class="text-[10px] font-mono text-amber-400">light_gpio</span>
          </div>
          <select id="room-gpio-light-select" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 font-mono text-xs">
            <option value="">-- Disconnected / No Sensor --</option>
          </select>
          <p class="text-[10px] text-stone-500 mt-1">If unassigned, the room card will not display lighting controls.</p>
        </div>

        <div>
          <div class="flex justify-between items-center mb-1">
            <label class="text-stone-400 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-sky-400"></span>
              DHT22 Temperature &amp; Humidity (GPIO)
            </label>
            <span class="text-[10px] font-mono text-sky-400">temp_gpio</span>
          </div>
          <select id="room-gpio-temp-select" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-sky-500 font-mono text-xs">
            <option value="">-- Disconnected / No Sensor --</option>
          </select>
          <p class="text-[10px] text-stone-500 mt-1">If unassigned, the room card will not display temperature or humidity placeholders.</p>
        </div>

        <div>
          <div class="flex justify-between items-center mb-1">
            <label class="text-stone-400 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-purple-400"></span>
              AC Power Relay Switch (GPIO)
            </label>
            <span class="text-[10px] font-mono text-purple-400">ac_gpio</span>
          </div>
          <select id="room-gpio-ac-select" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500 font-mono text-xs">
            <option value="">-- Disconnected / No Sensor --</option>
          </select>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-stone-800">
          <button type="button" onclick="closeRoomGpioModal()" class="px-4 py-2 rounded-xl text-stone-400 hover:text-white bg-stone-900 border border-stone-800">Cancel</button>
          <button type="submit" id="room-gpio-save-btn" class="px-4 py-2 rounded-xl font-bold text-black bg-amber-500 hover:bg-amber-400 active:scale-95 transition-all">Save &amp; Sync to Supabase</button>
        </div>
      </form>
    </div>
  </div>`;
}

export function getCreateRoomModalHtml(): string {
  return `
  <!-- Create Room Modal -->
  <div id="create-room-modal" class="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm hidden items-center justify-center p-4">
    <div class="glass-panel bg-stone-925 p-6 rounded-2xl max-w-lg w-full border border-stone-800 space-y-4 max-h-[90vh] overflow-y-auto">
      <div class="flex justify-between items-center border-b border-stone-800 pb-3">
        <div>
          <h3 class="text-base font-bold text-white flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            Create New Room
          </h3>
          <p class="text-[11px] text-stone-400 mt-0.5">Add a spatial zone in Supabase with interchangeable camera &amp; sensors</p>
        </div>
        <button onclick="closeCreateRoomModal()" class="text-stone-400 hover:text-white text-xl leading-none">&times;</button>
      </div>

      <form id="create-room-form" onsubmit="handleCreateRoom(event)" class="space-y-3.5 text-xs font-medium">
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2 sm:col-span-1">
            <label class="block text-stone-400 mb-1">Room Name <span class="text-red-400">*</span></label>
            <input id="create-room-name" required type="text" placeholder="e.g. Master Bedroom" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500">
          </div>
          <div class="col-span-2 sm:col-span-1">
            <label class="block text-stone-400 mb-1">Icon Category</label>
            <select id="create-room-icon" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500">
              <option value="Home">Home / General</option>
              <option value="Bed">Bed (Bedroom)</option>
              <option value="Utensils">Utensils (Kitchen / Dining)</option>
              <option value="Tv">Tv (Living / Media)</option>
              <option value="Coffee">Coffee (Lounge / Break)</option>
              <option value="Shield">Shield (Security / Perimeter)</option>
              <option value="Tool">Tool (Garage / Workshop)</option>
              <option value="Zap">Zap (Utility / Server)</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block text-stone-400 mb-1">Description</label>
          <input id="create-room-desc" type="text" placeholder="e.g. Workstation, 3D printing &amp; electronics" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500">
        </div>

        <!-- Interchangeable Camera Selection Section -->
        <div class="p-3.5 rounded-xl bg-stone-950/70 border border-stone-800 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-[10.5px] font-mono uppercase tracking-wider text-stone-300 font-bold flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
              </svg>
              Camera Feed Configuration
            </span>
            <span id="create-cam-badge" class="text-[9px] font-mono px-2 py-0.5 rounded bg-stone-850 text-stone-400 border border-stone-700">NONE</span>
          </div>

          <div>
            <label class="block text-[11px] text-stone-400 mb-1 font-medium">Camera Type / Source</label>
            <select id="create-room-cam-type" onchange="handleCamTypeChange('create')" class="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-medium">
              <option value="none">None (No Camera Attached)</option>
              <option value="tapo">Tapo IP Camera (RTSP Stream + Credentials)</option>
              <option value="rpi">Direct Raspberry Pi Camera (CSI Port 0 / V4L2)</option>
            </select>
          </div>

          <!-- Tapo RTSP Credentials & Stream URL Fields -->
          <div id="create-cam-tapo-fields" class="space-y-2.5 pt-1 hidden">
            <div class="grid grid-cols-2 gap-2.5">
              <div>
                <label class="block text-[10.5px] text-stone-400 mb-1">Camera IP Address <span class="text-emerald-400">*</span></label>
                <input id="create-room-cam-ip" type="text" placeholder="192.168.1.105" oninput="handleTapoCredentialsInput('create')" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-emerald-500">
              </div>
              <div>
                <label class="block text-[10.5px] text-stone-400 mb-1">Tapo Account Username</label>
                <input id="create-room-cam-user" type="text" placeholder="e.g. tapo_admin" oninput="handleTapoCredentialsInput('create')" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-emerald-500">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2.5">
              <div>
                <label class="block text-[10.5px] text-stone-400 mb-1">Tapo Account Password</label>
                <input id="create-room-cam-pass" type="password" placeholder="••••••••" oninput="handleTapoCredentialsInput('create')" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-emerald-500">
              </div>
              <div>
                <label class="block text-[10.5px] text-stone-400 mb-1">RTSP Stream URL</label>
                <input id="create-room-stream-url" type="text" placeholder="rtsp://user:pass@ip:554/stream1" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-emerald-500">
              </div>
            </div>
            <p class="text-[10px] text-stone-500 italic">Credentials are securely stored in Supabase to authorize VLC/ffmpeg RTSP streaming.</p>
          </div>

          <!-- Direct RPi Camera Hardware Card -->
          <div id="create-cam-rpi-fields" class="p-3 rounded-xl bg-purple-950/25 border border-purple-800/40 space-y-2 hidden">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
              <span class="text-xs font-bold text-purple-200">Native Raspberry Pi CSI Camera Attached</span>
            </div>
            <p class="text-[10.5px] text-stone-300 leading-relaxed">
              Streams directly from the on-board CSI ribbon cable (Sony IMX708 Wide) using native <code class="text-purple-300">rpicam-vid</code> MJPEG pipeline. No IP or login credentials required.
            </p>
            <div class="grid grid-cols-2 gap-2 pt-1 font-mono text-[9.5px]">
              <div class="bg-stone-950/80 p-2 rounded-lg border border-stone-850">
                <span class="text-stone-500 block text-[8.5px]">INTERFACE</span>
                <span class="text-purple-300 font-bold">CSI-2 /dev/video0</span>
              </div>
              <div class="bg-stone-950/80 p-2 rounded-lg border border-stone-850">
                <span class="text-stone-500 block text-[8.5px]">STREAM PROTOCOL</span>
                <span class="text-emerald-400 font-bold">rpicam://0 (MJPEG)</span>
              </div>
            </div>
          </div>

          <!-- None / Unassigned Info Note -->
          <div id="create-cam-none-fields" class="p-2 text-center text-[10.5px] text-stone-500 italic bg-stone-950/30 rounded-lg border border-stone-900">
            No camera hardware will be ingested or displayed on this room's card.
          </div>
        </div>

        <!-- Hardware GPIO Pin Connections -->
        <div class="p-3.5 rounded-xl bg-stone-950/60 border border-stone-850 space-y-2.5">
          <span class="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">Hardware GPIO Pin Connections</span>
          <div class="space-y-2">
            <div>
              <label class="block text-[11px] text-amber-300 mb-1">12V Light Relay (GPIO)</label>
              <select id="create-room-light-gpio" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500">
                <option value="">-- No Light Relay Connected --</option>
              </select>
            </div>
            <div>
              <label class="block text-[11px] text-sky-300 mb-1">Temperature DHT22 (GPIO)</label>
              <select id="create-room-temp-gpio" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-sky-500">
                <option value="">-- No Temp Sensor Connected --</option>
              </select>
            </div>
            <div>
              <label class="block text-[11px] text-purple-300 mb-1">AC Power Relay (GPIO)</label>
              <select id="create-room-ac-gpio" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-purple-500">
                <option value="">-- No AC Relay Connected --</option>
              </select>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-stone-800">
          <button type="button" onclick="closeCreateRoomModal()" class="px-4 py-2 rounded-xl text-stone-400 hover:text-white bg-stone-900 border border-stone-800">Cancel</button>
          <button type="submit" id="create-room-submit-btn" class="px-5 py-2 rounded-xl font-bold text-black bg-emerald-500 hover:bg-emerald-400 active:scale-95 transition-all">Create Room &amp; Sync Supabase</button>
        </div>
      </form>
    </div>
  </div>`;
}

export function getEditRoomModalHtml(): string {
  return `
  <!-- Edit Room Modal -->
  <div id="edit-room-modal" class="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm hidden items-center justify-center p-4">
    <div class="glass-panel bg-stone-925 p-6 rounded-2xl max-w-lg w-full border border-stone-800 space-y-4 max-h-[90vh] overflow-y-auto">
      <div class="flex justify-between items-center border-b border-stone-800 pb-3">
        <div>
          <h3 class="text-base font-bold text-white flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
            Edit Room &amp; Hardware
          </h3>
          <p id="edit-room-subtitle" class="text-[11px] text-stone-400 mt-0.5">Modify room parameters, camera switch &amp; hardware links</p>
        </div>
        <button onclick="closeEditRoomModal()" class="text-stone-400 hover:text-white text-xl leading-none">&times;</button>
      </div>

      <form id="edit-room-form" onsubmit="handleEditRoom(event)" class="space-y-3.5 text-xs font-medium">
        <input type="hidden" id="edit-room-id" />

        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2 sm:col-span-1">
            <label class="block text-stone-400 mb-1">Room Name <span class="text-red-400">*</span></label>
            <input id="edit-room-name" required type="text" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500">
          </div>
          <div class="col-span-2 sm:col-span-1">
            <label class="block text-stone-400 mb-1">Icon Category</label>
            <select id="edit-room-icon" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500">
              <option value="Home">Home / General</option>
              <option value="Bed">Bed (Bedroom)</option>
              <option value="Utensils">Utensils (Kitchen / Dining)</option>
              <option value="Tv">Tv (Living / Media)</option>
              <option value="Coffee">Coffee (Lounge / Break)</option>
              <option value="Shield">Shield (Security / Perimeter)</option>
              <option value="Tool">Tool (Garage / Workshop)</option>
              <option value="Zap">Zap (Utility / Server)</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block text-stone-400 mb-1">Description</label>
          <input id="edit-room-desc" type="text" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500">
        </div>

        <!-- Interchangeable Camera Selection Section -->
        <div class="p-3.5 rounded-xl bg-stone-950/70 border border-stone-800 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-[10.5px] font-mono uppercase tracking-wider text-stone-300 font-bold flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
              </svg>
              Camera Feed Configuration
            </span>
            <span id="edit-cam-badge" class="text-[9px] font-mono px-2 py-0.5 rounded bg-stone-850 text-stone-400 border border-stone-700">NONE</span>
          </div>

          <div>
            <label class="block text-[11px] text-stone-400 mb-1 font-medium">Camera Type / Source</label>
            <select id="edit-room-cam-type" onchange="handleCamTypeChange('edit')" class="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 font-medium">
              <option value="none">None (No Camera Attached)</option>
              <option value="tapo">Tapo IP Camera (RTSP Stream + Credentials)</option>
              <option value="rpi">Direct Raspberry Pi Camera (CSI Port 0 / V4L2)</option>
            </select>
          </div>

          <!-- Tapo RTSP Credentials & Stream URL Fields -->
          <div id="edit-cam-tapo-fields" class="space-y-2.5 pt-1 hidden">
            <div class="grid grid-cols-2 gap-2.5">
              <div>
                <label class="block text-[10.5px] text-stone-400 mb-1">Camera IP Address <span class="text-amber-400">*</span></label>
                <input id="edit-room-cam-ip" type="text" placeholder="192.168.1.105" oninput="handleTapoCredentialsInput('edit')" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500">
              </div>
              <div>
                <label class="block text-[10.5px] text-stone-400 mb-1">Tapo Account Username</label>
                <input id="edit-room-cam-user" type="text" placeholder="e.g. tapo_admin" oninput="handleTapoCredentialsInput('edit')" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2.5">
              <div>
                <label class="block text-[10.5px] text-stone-400 mb-1">Tapo Account Password</label>
                <input id="edit-room-cam-pass" type="password" placeholder="••••••••" oninput="handleTapoCredentialsInput('edit')" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500">
              </div>
              <div>
                <label class="block text-[10.5px] text-stone-400 mb-1">RTSP Stream URL</label>
                <input id="edit-room-stream-url" type="text" placeholder="rtsp://user:pass@ip:554/stream1" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500">
              </div>
            </div>
            <p class="text-[10px] text-stone-500 italic">Credentials are securely stored in Supabase to authorize VLC/ffmpeg RTSP streaming.</p>
          </div>

          <!-- Direct RPi Camera Hardware Card -->
          <div id="edit-cam-rpi-fields" class="p-3 rounded-xl bg-purple-950/25 border border-purple-800/40 space-y-2 hidden">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
              <span class="text-xs font-bold text-purple-200">Native Raspberry Pi CSI Camera Attached</span>
            </div>
            <p class="text-[10.5px] text-stone-300 leading-relaxed">
              Streams directly from the on-board CSI ribbon cable (Sony IMX708 Wide) using native <code class="text-purple-300">rpicam-vid</code> MJPEG pipeline. No IP or login credentials required.
            </p>
            <div class="grid grid-cols-2 gap-2 pt-1 font-mono text-[9.5px]">
              <div class="bg-stone-950/80 p-2 rounded-lg border border-stone-850">
                <span class="text-stone-500 block text-[8.5px]">INTERFACE</span>
                <span class="text-purple-300 font-bold">CSI-2 /dev/video0</span>
              </div>
              <div class="bg-stone-950/80 p-2 rounded-lg border border-stone-850">
                <span class="text-stone-500 block text-[8.5px]">STREAM PROTOCOL</span>
                <span class="text-emerald-400 font-bold">rpicam://0 (MJPEG)</span>
              </div>
            </div>
          </div>

          <!-- None / Unassigned Info Note -->
          <div id="edit-cam-none-fields" class="p-2 text-center text-[10.5px] text-stone-500 italic bg-stone-950/30 rounded-lg border border-stone-900">
            No camera hardware will be ingested or displayed on this room's card.
          </div>
        </div>

        <!-- Hardware GPIO Pin Connections -->
        <div class="p-3.5 rounded-xl bg-stone-950/60 border border-stone-850 space-y-2.5">
          <span class="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">Hardware GPIO Pin Connections</span>
          <div class="space-y-2">
            <div>
              <label class="block text-[11px] text-amber-300 mb-1">12V Light Relay (GPIO)</label>
              <select id="edit-room-light-gpio" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500"></select>
            </div>
            <div>
              <label class="block text-[11px] text-sky-300 mb-1">Temperature DHT22 (GPIO)</label>
              <select id="edit-room-temp-gpio" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-sky-500"></select>
            </div>
            <div>
              <label class="block text-[11px] text-purple-300 mb-1">AC Power Relay (GPIO)</label>
              <select id="edit-room-ac-gpio" class="w-full bg-stone-950 border border-stone-800 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-purple-500"></select>
            </div>
          </div>
        </div>

        <div class="flex justify-between items-center pt-3 border-t border-stone-800">
          <button type="button" onclick="handleDeleteRoomFromModal()" class="px-3 py-2 rounded-xl text-xs font-bold text-red-400 hover:text-red-300 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-all">
            Delete Room
          </button>
          <div class="flex gap-2">
            <button type="button" onclick="closeEditRoomModal()" class="px-4 py-2 rounded-xl text-stone-400 hover:text-white bg-stone-900 border border-stone-800">Cancel</button>
            <button type="submit" id="edit-room-save-btn" class="px-5 py-2 rounded-xl font-bold text-black bg-amber-500 hover:bg-amber-400 active:scale-95 transition-all">Save Changes</button>
          </div>
        </div>
      </form>
    </div>
  </div>`;
}
