export const telemetryScript = `
    let state = {
      pins: [],
      sensors: [],
      readings: {},
      faces: [],
      rooms: [],
      currentFaceDetection: { detected: false, status: 'none', person: null, confidence: 0, timestamp: new Date().toISOString() },
      selectedTrainingPhotos: []
    };

    window.wsClient = null;

    async function init() {
      try { startCanvasRenderLoop(); } catch (e) { console.error('Render loop error:', e); }
      try { setupWebSocket(); } catch (e) {}
      await Promise.allSettled([
        fetchRooms(),
        fetchPins(),
        fetchStatus(),
        fetchFaces()
      ]);
    }

    async function fetchRooms() {
      try {
        const res = await fetch('/api/rooms');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.rooms)) {
            state.rooms = data.rooms;
            renderRoomsList();
            updateTelemetryDisplay();
          }
        }
      } catch (err) {
        console.warn('Failed to fetch rooms:', err);
      }
    }

    function renderRoomsList() {
      const container = document.getElementById('rooms-camera-grid');
      if (!container) return;
      container.innerHTML = '';

      if (!state.rooms || state.rooms.length === 0) {
        container.innerHTML = '<div class="col-span-2 text-center py-6 text-stone-500 text-xs italic">No Citadel rooms synced yet. Link Home Token to pull rooms from Supabase.</div>';
        return;
      }

      state.rooms.forEach(room => {
        const card = document.createElement('div');
        card.className = 'relative overflow-hidden rounded-xl border border-stone-800 bg-stone-950/70 p-4 space-y-3 transition-all hover:border-amber-500/30';

        const hasCam = Boolean(room.camera_enabled);
        const isRpiCam = room.camera_type === 'rpi' || room.camera_ip === 'rpi-camera' || Boolean(room.camera_stream_url && room.camera_stream_url.startsWith('rpicam'));
        const hasTemp = room.temp_gpio !== null && room.temp_gpio !== undefined && room.temp_gpio !== '';
        const hasLight = room.light_gpio !== null && room.light_gpio !== undefined && room.light_gpio !== '';
        const hasAc = room.ac_gpio !== null && room.ac_gpio !== undefined && room.ac_gpio !== '';
        const camIp = room.camera_ip || '';
        const streamUrl = room.camera_stream_url || (camIp ? 'rtsp://' + (room.camera_username ? room.camera_username + ':***@' : '') + camIp + ':554/stream1' : '');
        const roomId = room.id;

        let camBadge = '<span class="px-1.5 py-0.5 rounded text-[8px] font-mono text-stone-500 bg-stone-900 border border-stone-800">NO CAM</span>';
        if (hasCam) {
          camBadge = isRpiCam
            ? '<span class="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-purple-500/20 border border-purple-500/40 text-purple-300">RPI CAM LIVE</span>'
            : '<span class="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">TAPO RTSP</span>';
        }

        // Temperature & Humidity display logic: STRICTLY NO PLACEHOLDERS
        let tempHtml = '';
        if (hasTemp) {
          const tempSensorId = 'sensor-temp-' + room.temp_gpio;
          const reading = state.readings[tempSensorId];
          let tempStr = '';
          let humStr = '';

          if (reading && reading.temperatureC !== undefined && reading.temperatureC !== null) {
            tempStr = reading.temperatureC.toFixed(1) + '°C';
            if (reading.humidityPct !== undefined && reading.humidityPct !== null) {
              humStr = reading.humidityPct.toFixed(0) + '%';
            }
          } else if (room.temperature !== null && room.temperature !== undefined) {
            tempStr = Number(room.temperature).toFixed(1) + '°C';
            if (room.humidity !== null && room.humidity !== undefined) {
              humStr = Number(room.humidity).toFixed(0) + '%';
            }
          } else {
            tempStr = 'GPIO ' + room.temp_gpio;
          }

          tempHtml = \`
            <div class="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-sky-500/10 border border-sky-500/25 text-sky-400 font-mono text-[10px] font-bold" title="DHT22 Sensor on GPIO \${room.temp_gpio}">
              <span class="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse"></span>
              <span>\${tempStr}</span>\${humStr ? '<span>•</span><span>' + humStr + '</span>' : ''}
            </div>
          \`;
        }

        // Lighting status & toggle switch: STRICTLY NO PLACEHOLDERS
        let lightHtml = '';
        if (hasLight) {
          const isLightOn = Boolean(room.lights_power);
          lightHtml = \`
            <div class="flex items-center justify-between p-2 rounded-xl bg-stone-900/90 border border-stone-800 text-xs font-mono">
              <div class="flex items-center gap-2 min-w-0">
                <span class="w-2 h-2 rounded-full shrink-0 \${isLightOn ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.8)] animate-pulse' : 'bg-stone-600'}"></span>
                <span class="\${isLightOn ? 'text-amber-300 font-bold' : 'text-stone-400'} text-[11px]">
                  12V Light: \${isLightOn ? 'ON' : 'OFF'}
                </span>
                <span class="text-[9px] text-stone-500 hidden sm:inline">(GPIO \${room.light_gpio})</span>
              </div>
              <button onclick="toggleRoomLight('\${room.id}', \${room.light_gpio}, \${isLightOn})" class="px-2.5 py-1 rounded-lg text-[10px] font-extrabold font-mono transition-all active:scale-95 \${isLightOn ? 'bg-amber-500 text-black hover:bg-amber-400 shadow-md shadow-amber-500/20' : 'bg-stone-800 text-stone-300 hover:bg-stone-700'}">
                \${isLightOn ? 'TURN OFF' : 'TURN ON'}
              </button>
            </div>
          \`;
        }

        card.innerHTML = \`
          <div class="flex justify-between items-start gap-2">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-white tracking-wide">\${room.name}</span>
                \${camBadge}
              </div>
              <p class="text-[10px] text-stone-400 truncate max-w-[180px] mt-0.5">\${room.description || 'Spatial Citadel Zone'}</p>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              \${tempHtml}
              <button onclick="openEditRoomModal('\${room.id}')" title="Edit room details &amp; camera" class="p-1.5 rounded-lg bg-stone-900 hover:bg-stone-850 text-stone-400 hover:text-emerald-400 border border-stone-800 transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
              </button>
              <button onclick="openRoomGpioModal('\${room.id}')" title="Configure room sensors &amp; GPIO pins" class="p-1.5 rounded-lg bg-stone-900 hover:bg-stone-850 text-stone-400 hover:text-amber-400 border border-stone-800 transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
              </button>
              <button onclick="handleDeleteRoom('\${room.id}', '\${(room.name || '').replace(/'/g, \"\\\\'\")}')" title="Delete room from Supabase" class="p-1.5 rounded-lg bg-stone-900 hover:bg-stone-850 text-stone-500 hover:text-red-400 border border-stone-800 transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </div>
          </div>

          \${hasCam ? \`
            <div class="relative aspect-video bg-stone-950 rounded-lg border border-stone-800 overflow-hidden flex items-center justify-center shadow-lg group">
              <!-- Live Processed Stream Frame -->
              <img id="room-stream-\${roomId}" src="/api/camera/stream?room=\${roomId}" alt="\${room.name} Stream" class="absolute inset-0 w-full h-full object-cover z-0" onerror="this.onerror=null; this.src='/api/camera/stream';" />
              
              <!-- Room HUD Overlay -->
              <div class="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/75 backdrop-blur-md border border-white/10 text-[8.5px] font-mono \${isRpiCam ? 'text-purple-300' : 'text-emerald-400'} font-bold z-10">
                <span class="w-1.5 h-1.5 rounded-full \${isRpiCam ? 'bg-purple-400' : 'bg-emerald-400'} animate-pulse"></span>
                <span>\${isRpiCam ? 'RPi CSI CAMERA' : (camIp || 'AI PROCESSED')}</span>
              </div>

              <div class="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/75 backdrop-blur-md border border-white/10 text-[8px] font-mono text-stone-300 z-10">
                <span>AI PROCESSED STREAM</span>
              </div>
            </div>

            <div class="p-2 rounded-lg bg-stone-900/90 border border-stone-800 space-y-1">
              <div class="flex justify-between items-center text-[9px] font-mono">
                <span class="text-stone-400">\${isRpiCam ? 'SOURCE:' : 'IP:'} <strong class="\${isRpiCam ? 'text-purple-300' : 'text-emerald-400'}">\${isRpiCam ? 'RP1 CSI-2 (/dev/video0)' : camIp}</strong></span>
                <span class="text-stone-500">\${isRpiCam ? 'MJPEG 10fps' : 'Port 554'}</span>
              </div>
              <div class="text-[8.5px] font-mono text-stone-500 truncate" title="\${streamUrl}">
                \${streamUrl}
              </div>
            </div>
          \` : \`
            <div class="aspect-video rounded-lg bg-stone-900/40 border border-stone-850/60 flex flex-col items-center justify-center text-center p-4 space-y-1 text-stone-500">
              <svg class="w-6 h-6 text-stone-600 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
              </svg>
              <span class="text-[11px] font-medium text-stone-400">Camera Unassigned</span>
              <span class="text-[9px] text-stone-600">Assign IP &amp; RTSP credentials in Smarter Home</span>
            </div>
          \`}

          <!-- Per-room connected hardware controllers -->
          \${lightHtml}
        \`;

        container.appendChild(card);
      });
    }

    async function toggleRoomLight(roomId, bcmGpio, currentPower) {
      const nextPower = !currentPower;
      const room = state.rooms.find(r => r.id === roomId);
      if (room) {
        room.lights_power = nextPower;
        renderRoomsList();
      }
      try {
        await fetch('/api/relay/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gpio: bcmGpio, power: nextPower, roomId })
        });
        if (typeof fetchPins === 'function') await fetchPins();
      } catch (err) {
        console.warn('Failed to toggle room light:', err);
        if (room) {
          room.lights_power = currentPower;
          renderRoomsList();
        }
      }
    }

    window.fetchRooms = fetchRooms;
    window.renderRoomsList = renderRoomsList;
    window.toggleRoomLight = toggleRoomLight;

    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        const badge = document.getElementById('hw-badge');
        if (badge) {
          if (data.isHardware) {
            badge.textContent = 'RPi HARDWARE';
            badge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold uppercase tracking-wider';
          } else {
            badge.textContent = 'SIMULATED ENV';
            badge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold uppercase tracking-wider';
          }
        }
        const syncStatusText = document.getElementById('sync-status-text');
        if (syncStatusText) {
          syncStatusText.textContent = data.sync?.lastSyncSuccess ? 'Connected' : 'Active';
        }

        const tokenRes = await fetch('/api/config/token');
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          const btnLabel = document.getElementById('token-btn-label');
          if (btnLabel) {
            btnLabel.textContent = tokenData.token ? 'Home Linked ✅' : 'Link Home Token';
          }
          const cardStatus = document.getElementById('cloud-link-card-status');
          if (cardStatus) {
            cardStatus.textContent = tokenData.token ? 'Connected & Authenticated' : 'Not Linked (Click to Configure)';
            cardStatus.className = tokenData.token ? 'text-[11px] text-emerald-400 font-mono font-bold' : 'text-[11px] text-amber-400 font-mono';
          }
          const targetUrlElem = document.getElementById('cloud-link-target-url');
          if (targetUrlElem) {
            targetUrlElem.textContent = tokenData.apiUrl || 'Supabase Direct';
          }
          const activeTokenElem = document.getElementById('cloud-link-active-token');
          if (activeTokenElem) {
            if (tokenData.token) {
              activeTokenElem.textContent = tokenData.token.substring(0, 12) + '...' + tokenData.token.substring(tokenData.token.length - 4);
              activeTokenElem.className = 'text-emerald-400 font-bold';
            } else {
              activeTokenElem.textContent = 'None';
              activeTokenElem.className = 'text-amber-400';
            }
          }
        }
      } catch (err) {}
    }

    async function fetchFaces() {
      try {
        const res = await fetch('/api/faces');
        const data = await res.json();
        state.faces = data.faces || [];
        renderFacesList();
      } catch (err) {}
    }

    function renderFacesList() {
      const list = document.getElementById('enrolled-faces-list');
      list.innerHTML = '';
      if (state.faces.length === 0) {
        list.innerHTML = '<p class="text-xs text-stone-500 col-span-2 italic">No recognized members enrolled yet.</p>';
        return;
      }

      state.faces.forEach(f => {
        const item = document.createElement('div');
        item.className = 'flex justify-between items-center p-3 rounded-xl bg-stone-950/50 border border-stone-850';
        item.innerHTML = '<div>' +
          '<div class="text-xs font-bold text-stone-200">' + f.name + '</div>' +
          '<div class="text-[10px] text-stone-500">' + (f.notes || 'Household Member') + '</div>' +
        '</div>';

        const delBtn = document.createElement('button');
        delBtn.className = 'text-stone-600 hover:text-red-400 text-xs px-2 py-1';
        delBtn.innerHTML = '&times;';
        delBtn.onclick = () => removeFace(f.id);
        item.appendChild(delBtn);

        list.appendChild(item);
      });
    }

    function setupWebSocket() {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      window.wsClient = new WebSocket(proto + '//' + location.host + '/ws/telemetry');

      window.wsClient.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'initial_state') {
            state.pins = msg.pins;
            state.sensors = msg.sensors;
            state.readings = msg.readings;
            if (msg.rooms && Array.isArray(msg.rooms) && msg.rooms.length > 0) {
              state.rooms = msg.rooms;
            }
            renderPinHeader();
            if (typeof renderRoomsList === 'function') renderRoomsList();
            updateTelemetryDisplay();
          } else if (msg.type === 'pins_updated') {
            state.pins = msg.pins;
            if (typeof renderPinHeader === 'function') renderPinHeader();
            if (typeof renderSupabaseSensors === 'function') renderSupabaseSensors();
            if (typeof renderRoomsList === 'function') renderRoomsList();
            updateTelemetryDisplay();
          } else if (msg.type === 'rooms_updated') {
            if (msg.rooms && Array.isArray(msg.rooms)) {
              state.rooms = msg.rooms;
              if (typeof renderRoomsList === 'function') renderRoomsList();
              updateTelemetryDisplay();
            }
          } else if (msg.type === 'sensor_reading') {
            state.readings[msg.reading.sensorId] = msg.reading;
            updateTelemetryDisplay();
          } else if (msg.type === 'face_detection') {
            state.currentFaceDetection = msg.event;
            updateFaceDisplay(msg.event);
          }
        } catch (e) {}
      };

      window.wsClient.onclose = () => {
        setTimeout(setupWebSocket, 2000);
      };
    }

    function updateTelemetryDisplay() {
      const tempRoom = state.rooms ? state.rooms.find(r => r.temp_gpio !== null && r.temp_gpio !== undefined && r.temp_gpio !== '') : null;
      const tempValEl = document.getElementById('temp-val');
      const tempFValEl = document.getElementById('temp-val-f');
      const tempBarEl = document.getElementById('temp-bar');
      const ambientRoomNameEl = document.getElementById('ambient-room-name');

      const humValEl = document.getElementById('hum-val');
      const humBarEl = document.getElementById('hum-bar');
      const humBadgeEl = document.getElementById('hum-status-badge');
      const ambientHumSourceEl = document.getElementById('ambient-hum-source');

      if (tempRoom) {
        const sensorId = 'sensor-temp-' + tempRoom.temp_gpio;
        const reading = state.readings[sensorId];

        let tempC = null;
        let tempF = null;
        let hum = null;
        let sourceLabel = tempRoom.name + ' (GPIO ' + tempRoom.temp_gpio + ')';

        if (reading && reading.temperatureC !== null && reading.temperatureC !== undefined) {
          tempC = reading.temperatureC;
          tempF = reading.temperatureF !== null && reading.temperatureF !== undefined ? reading.temperatureF : (tempC * 1.8 + 32);
          hum = (reading.humidityPct !== null && reading.humidityPct !== undefined) ? reading.humidityPct : null;
          sourceLabel += ' • Live Sensor';
        } else if (tempRoom.temperature !== null && tempRoom.temperature !== undefined) {
          tempC = Number(tempRoom.temperature);
          tempF = tempC * 1.8 + 32;
          hum = tempRoom.humidity !== null && tempRoom.humidity !== undefined ? Number(tempRoom.humidity) : null;
          sourceLabel += ' • Supabase Record';
        } else {
          sourceLabel += ' • Awaiting Sensor';
        }

        if (tempC !== null && !isNaN(tempC)) {
          if (tempValEl) tempValEl.textContent = tempC.toFixed(1);
          if (tempFValEl) tempFValEl.textContent = tempF.toFixed(1) + ' °F';
          if (tempBarEl) tempBarEl.style.width = Math.min(100, Math.max(0, (tempC / 45) * 100)) + '%';
        } else {
          if (tempValEl) tempValEl.textContent = '--';
          if (tempFValEl) tempFValEl.textContent = '-- °F';
          if (tempBarEl) tempBarEl.style.width = '0%';
        }
        if (ambientRoomNameEl) ambientRoomNameEl.textContent = sourceLabel;

        if (hum !== null && !isNaN(hum)) {
          if (humValEl) humValEl.textContent = hum.toFixed(1);
          if (humBarEl) humBarEl.style.width = Math.min(100, Math.max(0, hum)) + '%';
          if (humBadgeEl) {
            if (hum >= 40 && hum <= 60) {
              humBadgeEl.textContent = 'OPTIMAL';
              humBadgeEl.className = 'text-xs font-mono text-emerald-400 ml-auto font-bold';
            } else if (hum > 60) {
              humBadgeEl.textContent = 'HUMID';
              humBadgeEl.className = 'text-xs font-mono text-sky-400 ml-auto font-bold';
            } else {
              humBadgeEl.textContent = 'DRY';
              humBadgeEl.className = 'text-xs font-mono text-amber-400 ml-auto font-bold';
            }
          }
        } else {
          if (humValEl) humValEl.textContent = '--';
          if (humBarEl) humBarEl.style.width = '0%';
          if (humBadgeEl) {
            humBadgeEl.textContent = '--';
            humBadgeEl.className = 'text-xs font-mono text-stone-500 ml-auto font-bold';
          }
        }
        if (ambientHumSourceEl) ambientHumSourceEl.textContent = sourceLabel;
      } else {
        if (tempValEl) tempValEl.textContent = '--';
        if (tempFValEl) tempFValEl.textContent = '-- °F';
        if (tempBarEl) tempBarEl.style.width = '0%';
        if (ambientRoomNameEl) ambientRoomNameEl.textContent = 'No temperature sensor assigned in Supabase';

        if (humValEl) humValEl.textContent = '--';
        if (humBarEl) humBarEl.style.width = '0%';
        if (humBadgeEl) {
          humBadgeEl.textContent = '--';
          humBadgeEl.className = 'text-xs font-mono text-stone-500 ml-auto font-bold';
        }
        if (ambientHumSourceEl) ambientHumSourceEl.textContent = 'No humidity sensor assigned in Supabase';
      }

      for (const r of Object.values(state.readings)) {
        if (r.sensorType === 'camera' && r.faceDetection) {
          state.currentFaceDetection = r.faceDetection;
          updateFaceDisplay(r.faceDetection);
        }
      }
      if (typeof renderRoomsList === 'function') renderRoomsList();
    }

    function updateFaceDisplay(det) {
      if (!det) return;
      const badge = document.getElementById('face-state-badge');
      const detDetected = document.getElementById('det-detected');
      const detStatus = document.getElementById('det-status');
      const detPerson = document.getElementById('det-person');
      const detConfidence = document.getElementById('det-confidence');
      const detTime = document.getElementById('det-time');

      if (detDetected) detDetected.textContent = det.detected ? 'Yes' : 'No';
      if (detStatus) {
        detStatus.textContent = det.status || 'none';
        detStatus.className = det.status === 'recognized' ? 'text-xs font-mono text-emerald-400 font-bold uppercase' : (det.status === 'unknown' ? 'text-xs font-mono text-orange-400 font-bold uppercase' : 'text-xs font-mono text-stone-400');
      }
      if (detPerson) {
        detPerson.textContent = det.person || 'None';
        detPerson.className = det.status === 'recognized' ? 'font-bold text-emerald-400 text-sm mt-0.5 block truncate' : (det.status === 'unknown' ? 'font-bold text-orange-400 text-sm mt-0.5 block truncate' : 'font-bold text-stone-400 text-sm mt-0.5 block truncate');
      }
      if (detConfidence) {
        const confVal = Number(det.confidence);
        detConfidence.textContent = !isNaN(confVal) ? (confVal * 100).toFixed(1) + '%' : '0.0%';
      }
      if (detTime) detTime.textContent = det.timestamp ? new Date(det.timestamp).toLocaleTimeString() : '--:--:--';

      if (badge) {
        if (det.detected) {
          if (det.status === 'recognized') {
            badge.textContent = 'RECOGNIZED: ' + (det.person || 'Unknown');
            badge.className = 'text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
          } else {
            badge.textContent = 'UNKNOWN PERSON';
            badge.className = 'text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30';
          }
        } else {
          badge.textContent = 'MONITORING';
          badge.className = 'text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-stone-800 text-stone-400';
        }
      }
    }

    window.state = state;
    window.init = init;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
`;
