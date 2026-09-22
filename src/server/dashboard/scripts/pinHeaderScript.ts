export const pinHeaderScript = `
    // State extension for Supabase sensors & header
    if (!state.supabaseSensors) state.supabaseSensors = [];
    if (!state.supabaseConnected) state.supabaseConnected = false;

    async function fetchPins() {
      try {
        const res = await fetch('/api/pins');
        const data = await res.json();
        state.pins = data.pins || [];
        state.supabaseSensors = data.supabaseSensors || [];
        state.supabaseConnected = Boolean(data.supabaseConnected);
        renderPinHeader();
        renderSupabaseSensors();
        updateSupabaseHeaderBadge(data);
      } catch (err) {
        console.warn('Failed to fetch pins from Supabase:', err);
      }
    }

    async function syncPinsWithSupabase() {
      const syncBtn = document.getElementById('sync-pins-btn');
      if (syncBtn) {
        syncBtn.classList.add('animate-spin');
      }
      try {
        await fetchPins();
      } finally {
        if (syncBtn) {
          syncBtn.classList.remove('animate-spin');
        }
      }
    }

    function updateSupabaseHeaderBadge(data) {
      const badge = document.getElementById('supabase-header-badge');
      if (!badge) return;

      if (data && data.supabaseConnected) {
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span><span class="text-emerald-300 font-bold">Supabase: Synced</span>';
        badge.className = 'flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-mono';
      } else {
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400"></span><span class="text-amber-300 font-bold">Local / Offline</span>';
        badge.className = 'flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-mono';
      }
    }

    function getPinColor(pin) {
      if (!pin) return '#78716c';
      if (pin.assignedSensor) {
        const type = (pin.assignedSensor.type || '').toLowerCase();
        if (type === 'temperature') return '#38bdf8'; // Sky blue for temp
        if (type === 'relay' && pin.assignedSensor.name && pin.assignedSensor.name.includes('AC')) return '#a855f7'; // Purple for AC
        if (type === 'relay' || type === 'light') return '#fbbf24'; // Amber for light relay
        return '#f59e0b';
      }
      if (pin.assignedSensorId) return '#fbbf24';
      if (pin.capabilities.includes('POWER_5V')) return '#ef4444';
      if (pin.capabilities.includes('POWER_3V3')) return '#fb923c';
      if (pin.capabilities.includes('GROUND')) return '#78716c';
      return '#34d399'; // Emerald for unassigned GPIO
    }

    function renderPinHeader() {
      const container = document.getElementById('pin-header-container');
      if (!container) return;
      container.innerHTML = '';

      for (let i = 1; i <= 40; i += 2) {
        const pinLeft = state.pins.find(p => p.pinNumber === i);
        const pinRight = state.pins.find(p => p.pinNumber === i + 1);

        const row = document.createElement('div');
        row.className = 'grid grid-cols-2 gap-2 pin-row p-1.5 rounded-lg hover:bg-stone-900/80 transition-all border border-transparent hover:border-stone-800';

        if (pinLeft) row.appendChild(createPinElement(pinLeft, 'left'));
        if (pinRight) row.appendChild(createPinElement(pinRight, 'right'));
        container.appendChild(row);
      }
    }

    function createPinElement(pin, side) {
      const el = document.createElement('div');
      const assigned = pin.assignedSensor;
      const isAssigned = Boolean(assigned || pin.assignedSensorId);
      const isGpio = pin.capabilities.includes('GPIO');
      const color = getPinColor(pin);

      el.className = 'flex items-center gap-2 cursor-pointer group select-none';
      el.onclick = () => {
        if (isAssigned) {
          openPinDetailsModal(pin.pinNumber);
        } else if (isGpio) {
          openAddSensorModal(pin.pinNumber);
        }
      };

      let tagHtml = '';
      if (assigned) {
        const t = (assigned.type || '').toLowerCase();
        if (t === 'temperature') {
          tagHtml = '<span class="px-1 py-0.2 rounded text-[8px] bg-sky-500/20 text-sky-300 border border-sky-500/30 shrink-0 font-sans">TEMP</span>';
        } else if (assigned.name && assigned.name.includes('AC')) {
          tagHtml = '<span class="px-1 py-0.2 rounded text-[8px] bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0 font-sans">AC</span>';
        } else {
          tagHtml = '<span class="px-1 py-0.2 rounded text-[8px] bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0 font-sans">LIGHT</span>';
        }
      }

      let labelText = pin.pinNumber + '. ' + pin.name;
      if (assigned) {
        const roomShort = assigned.roomName ? ' [' + assigned.roomName + ']' : '';
        labelText = pin.pinNumber + '. GPIO ' + pin.bcmGpio + roomShort;
      }

      const dot = '<span class="pin-dot shrink-0" style="background-color: ' + color + '"></span>';
      const label = '<span class="truncate text-[11px] ' + (isAssigned ? 'text-amber-300 font-bold' : isGpio ? 'text-stone-300 group-hover:text-white' : 'text-stone-500') + '" title="' + (assigned ? assigned.name + ' (' + (assigned.roomName || '') + ')' : pin.name) + '">' +
        labelText +
      '</span>' + tagHtml;

      if (side === 'left') {
        el.innerHTML = label + dot;
        el.classList.add('justify-end', 'text-right');
      } else {
        el.innerHTML = dot + label;
        el.classList.add('justify-start', 'text-left');
      }

      return el;
    }

    function renderSupabaseSensors() {
      const container = document.getElementById('supabase-sensors-list');
      const countBadge = document.getElementById('supabase-sensor-count');
      if (!container) return;

      const sensors = state.supabaseSensors || [];
      if (countBadge) {
        countBadge.textContent = sensors.length + ' Active';
      }

      if (sensors.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-stone-500 text-xs italic bg-stone-950/40 rounded-xl border border-stone-850">No hardware sensors assigned to GPIO in Supabase. Assign a pin to any room to sync instantly.</div>';
        return;
      }

      container.innerHTML = '';
      sensors.forEach(s => {
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between p-2.5 rounded-xl bg-stone-950/70 border border-stone-850 hover:border-amber-500/40 transition-all text-xs font-mono';

        let typeBadge = '';
        let stateBadge = '';

        if (s.type === 'temperature') {
          typeBadge = '<span class="px-1.5 py-0.5 rounded text-[9px] bg-sky-500/15 border border-sky-500/30 text-sky-400 font-bold">DHT22 TEMP</span>';
          if (s.state && s.state.temperature !== undefined && s.state.temperature !== null) {
            const humStr = (s.state.humidity !== undefined && s.state.humidity !== null) ? s.state.humidity + '%' : '--';
            stateBadge = '<span class="text-sky-300 font-bold">' + Number(s.state.temperature).toFixed(1) + '°C</span> • <span class="text-stone-400">' + humStr + '</span>';
          } else {
            stateBadge = '<span class="text-stone-500 text-[10px] italic">--</span>';
          }
        } else if (s.name && s.name.includes('AC')) {
          typeBadge = '<span class="px-1.5 py-0.5 rounded text-[9px] bg-purple-500/15 border border-purple-500/30 text-purple-400 font-bold">AC RELAY</span>';
          const isPower = s.state && s.state.power;
          stateBadge = isPower
            ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400">POWER ON</span>'
            : '<span class="px-1.5 py-0.5 rounded text-[9px] text-stone-500 bg-stone-900">POWER OFF</span>';
        } else {
          typeBadge = '<span class="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold">LIGHT RELAY</span>';
          const isPower = s.state && s.state.power;
          stateBadge = isPower
            ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300">LIGHT ON</span>'
            : '<span class="px-1.5 py-0.5 rounded text-[9px] text-stone-500 bg-stone-900">LIGHT OFF</span>';
        }

        item.innerHTML = \`
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="w-2 h-2 rounded-full \${s.type === 'temperature' ? 'bg-sky-400' : s.name.includes('AC') ? 'bg-purple-400' : 'bg-amber-400'}"></span>
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="font-bold text-white text-xs truncate">\${s.roomName}</span>
                \${typeBadge}
              </div>
              <div class="text-[10px] text-stone-400 mt-0.5">
                Connected to <strong class="text-amber-400">GPIO \${s.bcmGpio}</strong> (Pin \${s.pinNumber})
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <div>\${stateBadge}</div>
            <button onclick="openPinDetailsModal(\${s.pinNumber})" class="p-1 text-stone-500 hover:text-amber-400 rounded-lg hover:bg-stone-900 transition-colors" title="Inspect Pin">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </button>
          </div>
        \`;
        container.appendChild(item);
      });
    }

    function openPinDetailsModal(pinNumber) {
      const pin = state.pins.find(p => p.pinNumber === pinNumber);
      if (!pin) return;

      const modal = document.getElementById('pin-details-modal');
      if (!modal) return;

      const assigned = pin.assignedSensor;
      document.getElementById('pindet-title').textContent = 'Pin ' + pin.pinNumber + ' (GPIO ' + (pin.bcmGpio !== null ? pin.bcmGpio : 'N/A') + ')';
      document.getElementById('pindet-name').textContent = assigned ? assigned.name : pin.name;
      document.getElementById('pindet-room').textContent = (assigned && assigned.roomName) ? assigned.roomName : 'No Supabase Room Assigned';
      document.getElementById('pindet-type').textContent = assigned ? assigned.type.toUpperCase() : 'General GPIO';
      document.getElementById('pindet-source').textContent = (assigned && assigned.source) ? assigned.source.toUpperCase() : 'HARDWARE';

      const actionBtn = document.getElementById('pindet-action-btn');
      if (assigned && (assigned.type === 'relay' || assigned.type === 'light')) {
        const isPower = assigned.state && assigned.state.power;
        actionBtn.textContent = isPower ? 'Turn Relay OFF' : 'Turn Relay ON';
        actionBtn.className = isPower
          ? 'px-3 py-1.5 rounded-xl font-bold text-xs bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30'
          : 'px-3 py-1.5 rounded-xl font-bold text-xs bg-amber-500 text-black hover:bg-amber-400';
        actionBtn.onclick = async () => {
          await fetch('/api/relay/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gpio: pin.bcmGpio })
          });
          closePinDetailsModal();
          await fetchPins();
        };
        actionBtn.classList.remove('hidden');
      } else {
        actionBtn.classList.add('hidden');
      }

      const unassignBtn = document.getElementById('pindet-unassign-btn');
      if (assigned && assigned.roomId) {
        unassignBtn.classList.remove('hidden');
        unassignBtn.onclick = async () => {
          if (!confirm('Unassign this sensor from GPIO ' + pin.bcmGpio + ' in Supabase?')) return;
          const prop = assigned.name.includes('AC') ? 'ac_gpio' : assigned.type === 'temperature' ? 'temp_gpio' : 'light_gpio';
          await fetch('/api/pins/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: assigned.roomId, property: prop, bcmGpio: null })
          });
          closePinDetailsModal();
          await fetchPins();
        };
      } else {
        unassignBtn.classList.add('hidden');
      }

      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    function closePinDetailsModal() {
      const modal = document.getElementById('pin-details-modal');
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    }

    window.syncPinsWithSupabase = syncPinsWithSupabase;
    window.openPinDetailsModal = openPinDetailsModal;
    window.closePinDetailsModal = closePinDetailsModal;
    window.fetchPins = fetchPins;
`;
