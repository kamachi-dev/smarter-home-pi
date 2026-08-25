export const telemetryScript = `
    let state = {
      pins: [],
      sensors: [],
      readings: {},
      faces: [],
      currentFaceDetection: { detected: false, status: 'none', person: null, confidence: 0, timestamp: new Date().toISOString() },
      selectedTrainingPhotos: []
    };

    window.wsClient = null;

    async function init() {
      await fetchStatus();
      await fetchPins();
      await fetchFaces();
      setupWebSocket();
      initAutoWebcam();
      startCanvasRenderLoop();
    }

    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        const badge = document.getElementById('hw-badge');
        if (data.isHardware) {
          badge.textContent = 'RPi HARDWARE';
          badge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold uppercase tracking-wider';
        } else {
          badge.textContent = 'SIMULATED ENV';
          badge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold uppercase tracking-wider';
        }
        document.getElementById('sync-status-text').textContent = data.sync?.lastSyncSuccess ? 'Connected' : 'Active';

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

    async function fetchPins() {
      try {
        const res = await fetch('/api/pins');
        const data = await res.json();
        state.pins = data.pins || [];
        renderPinHeader();
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

    function renderPinHeader() {
      const container = document.getElementById('pin-header-container');
      container.innerHTML = '';

      for (let i = 1; i <= 40; i += 2) {
        const pinLeft = state.pins.find(p => p.pinNumber === i);
        const pinRight = state.pins.find(p => p.pinNumber === i + 1);

        const row = document.createElement('div');
        row.className = 'grid grid-cols-2 gap-2 pin-row p-1 rounded hover:bg-stone-900/60 transition-colors';

        row.appendChild(createPinElement(pinLeft, 'left'));
        row.appendChild(createPinElement(pinRight, 'right'));
        container.appendChild(row);
      }
    }

    function getPinColor(pin) {
      if (pin.assignedSensorId) return '#fbbf24';
      if (pin.capabilities.includes('POWER_5V')) return '#ef4444';
      if (pin.capabilities.includes('POWER_3V3')) return '#fb923c';
      if (pin.capabilities.includes('GROUND')) return '#78716c';
      return '#34d399';
    }

    function createPinElement(pin, side) {
      const el = document.createElement('div');
      const isAssigned = !!pin.assignedSensorId;
      const isGpio = pin.capabilities.includes('GPIO');
      const color = getPinColor(pin);

      el.className = 'flex items-center gap-2 cursor-pointer';
      el.onclick = () => {
        if (isGpio) {
          openAddSensorModal(pin.pinNumber);
        }
      };

      const dot = '<span class="pin-dot shrink-0" style="background-color: ' + color + '"></span>';
      const label = '<span class="truncate ' + (isAssigned ? 'text-amber-300 font-bold' : isGpio ? 'text-stone-300' : 'text-stone-500') + '">' +
        pin.pinNumber + '. ' + pin.name + (isAssigned ? ' [Attached]' : '') +
      '</span>';

      if (side === 'left') {
        el.innerHTML = label + dot;
        el.classList.add('justify-end', 'text-right');
      } else {
        el.innerHTML = dot + label;
        el.classList.add('justify-start', 'text-left');
      }

      return el;
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
        '</div>' +
        '<button onclick="removeFace(\\\'' + f.id + '\\\')" class="text-stone-600 hover:text-red-400 text-xs px-2 py-1">&times;</button>';
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
            renderPinHeader();
            updateTelemetryDisplay();
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
      for (const r of Object.values(state.readings)) {
        if (r.sensorType === 'temperature') {
          document.getElementById('temp-val').textContent = r.temperatureC.toFixed(1);
          document.getElementById('temp-val-f').textContent = r.temperatureF.toFixed(1) + ' °F';
          document.getElementById('hum-val').textContent = (r.humidityPct || 50).toFixed(1);
        } else if (r.sensorType === 'camera' && r.faceDetection) {
          state.currentFaceDetection = r.faceDetection;
          updateFaceDisplay(r.faceDetection);
        }
      }
    }

    function updateFaceDisplay(det) {
      const badge = document.getElementById('face-state-badge');

      document.getElementById('det-detected').textContent = det.detected ? 'Yes' : 'No';
      document.getElementById('det-status').textContent = det.status || 'none';
      document.getElementById('det-person').textContent = det.person || 'None';
      document.getElementById('det-confidence').textContent = (det.confidence * 100).toFixed(1) + '%';
      document.getElementById('det-time').textContent = new Date(det.timestamp).toLocaleTimeString();

      if (det.detected) {
        if (det.status === 'recognized') {
          badge.textContent = 'RECOGNIZED: ' + det.person;
          badge.className = 'text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
        } else {
          badge.textContent = 'UNKNOWN PERSON';
          badge.className = 'text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30';
        }
      } else {
        badge.textContent = 'MONITORING';
        badge.className = 'text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-stone-800 text-stone-400';
      }
    }
`;
