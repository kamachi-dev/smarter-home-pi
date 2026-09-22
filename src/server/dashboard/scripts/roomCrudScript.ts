export const roomCrudScript = `
    function handleCamTypeChange(mode) {
      const select = document.getElementById(mode + '-room-cam-type');
      if (!select) return;
      const val = select.value;

      const tapoFields = document.getElementById(mode + '-cam-tapo-fields');
      const rpiFields = document.getElementById(mode + '-cam-rpi-fields');
      const noneFields = document.getElementById(mode + '-cam-none-fields');
      const badge = document.getElementById(mode + '-cam-badge');

      if (tapoFields) tapoFields.classList.toggle('hidden', val !== 'tapo');
      if (rpiFields) rpiFields.classList.toggle('hidden', val !== 'rpi');
      if (noneFields) noneFields.classList.toggle('hidden', val !== 'none');

      if (badge) {
        if (val === 'tapo') {
          badge.textContent = 'TAPO RTSP';
          badge.className = 'text-[9px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold';
        } else if (val === 'rpi') {
          badge.textContent = 'RPI CSI CAM';
          badge.className = 'text-[9px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold';
        } else {
          badge.textContent = 'NONE';
          badge.className = 'text-[9px] font-mono px-2 py-0.5 rounded bg-stone-850 text-stone-400 border border-stone-700';
        }
      }
    }

    function handleTapoCredentialsInput(mode) {
      const ip = (document.getElementById(mode + '-room-cam-ip')?.value || '').trim();
      const user = (document.getElementById(mode + '-room-cam-user')?.value || '').trim();
      const pass = (document.getElementById(mode + '-room-cam-pass')?.value || '').trim();
      const streamInput = document.getElementById(mode + '-room-stream-url');

      if (streamInput && ip) {
        let authPrefix = '';
        if (user && pass) {
          authPrefix = encodeURIComponent(user) + ':' + encodeURIComponent(pass) + '@';
        } else if (user) {
          authPrefix = encodeURIComponent(user) + '@';
        }
        streamInput.value = 'rtsp://' + authPrefix + ip + ':554/stream1';
      }
    }

    function populateCreateRoomGpioDropdowns() {
      const gpioPins = (state.pins || []).filter(p => p.capabilities && p.capabilities.includes('GPIO'));
      function buildOpts() {
        let html = '<option value="">-- No Pin Connected --</option>';
        gpioPins.forEach(p => {
          let assignedLabel = p.assignedSensor ? ' [Assigned: ' + (p.assignedSensor.roomName || p.assignedSensor.name) + ']' : '';
          html += '<option value="' + p.bcmGpio + '">GPIO ' + p.bcmGpio + ' (Physical Pin ' + p.pinNumber + ')' + assignedLabel + '</option>';
        });
        return html;
      }
      const l = document.getElementById('create-room-light-gpio');
      const t = document.getElementById('create-room-temp-gpio');
      const a = document.getElementById('create-room-ac-gpio');
      if (l) l.innerHTML = buildOpts();
      if (t) t.innerHTML = buildOpts();
      if (a) a.innerHTML = buildOpts();
    }

    function openCreateRoomModal() {
      const modal = document.getElementById('create-room-modal');
      if (!modal) return;
      const form = document.getElementById('create-room-form');
      if (form) form.reset();

      const camSelect = document.getElementById('create-room-cam-type');
      if (camSelect) {
        camSelect.value = 'none';
        handleCamTypeChange('create');
      }

      populateCreateRoomGpioDropdowns();
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    function closeCreateRoomModal() {
      const modal = document.getElementById('create-room-modal');
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    }

    async function handleCreateRoom(e) {
      e.preventDefault();
      const name = document.getElementById('create-room-name').value.trim();
      const description = document.getElementById('create-room-desc').value.trim();
      const icon = document.getElementById('create-room-icon').value;

      const camType = document.getElementById('create-room-cam-type')?.value || 'none';
      let camera_ip = null;
      let camera_username = null;
      let camera_password = null;
      let camera_stream_url = null;
      let camera_enabled = false;

      if (camType === 'rpi') {
        camera_ip = 'rpi-camera';
        camera_stream_url = 'rpicam://0';
        camera_enabled = true;
      } else if (camType === 'tapo') {
        camera_ip = document.getElementById('create-room-cam-ip')?.value.trim() || null;
        camera_username = document.getElementById('create-room-cam-user')?.value.trim() || null;
        camera_password = document.getElementById('create-room-cam-pass')?.value.trim() || null;
        camera_stream_url = document.getElementById('create-room-stream-url')?.value.trim() || null;
        camera_enabled = Boolean(camera_ip);
      }
      
      const lightVal = document.getElementById('create-room-light-gpio').value;
      const tempVal = document.getElementById('create-room-temp-gpio').value;
      const acVal = document.getElementById('create-room-ac-gpio').value;

      const light_gpio = lightVal !== '' ? parseInt(lightVal, 10) : null;
      const temp_gpio = tempVal !== '' ? parseInt(tempVal, 10) : null;
      const ac_gpio = acVal !== '' ? parseInt(acVal, 10) : null;

      const btn = document.getElementById('create-room-submit-btn');
      if (btn) {
        btn.textContent = 'Creating in Supabase...';
        btn.disabled = true;
      }

      try {
        const res = await fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            description,
            icon,
            camera_type: camType,
            camera_enabled,
            camera_ip,
            camera_username,
            camera_password,
            camera_stream_url,
            light_gpio,
            temp_gpio,
            ac_gpio
          })
        });

        if (!res.ok) {
          const err = await res.json();
          alert('Failed to create room: ' + (err.error || 'Server error'));
          return;
        }

        const data = await res.json();
        if (data.rooms) state.rooms = data.rooms;
        closeCreateRoomModal();
        await fetchRooms();
        if (typeof fetchPins === 'function') await fetchPins();
      } catch (err) {
        alert('Error: ' + err.message);
      } finally {
        if (btn) {
          btn.textContent = 'Create Room & Sync Supabase';
          btn.disabled = false;
        }
      }
    }

    function populateEditRoomGpioDropdowns(room) {
      const gpioPins = (state.pins || []).filter(p => p.capabilities && p.capabilities.includes('GPIO'));
      function buildOpts(currentGpio) {
        let html = '<option value="">-- No Pin Connected --</option>';
        gpioPins.forEach(p => {
          const isSelected = currentGpio !== null && currentGpio !== undefined && currentGpio !== '' && parseInt(currentGpio) === p.bcmGpio;
          let assignedLabel = '';
          if (p.assignedSensor) {
            const isThis = p.assignedSensor.roomId === room.id;
            assignedLabel = isThis ? ' [Current ' + (p.assignedSensor.type || '') + ']' : ' [Assigned: ' + (p.assignedSensor.roomName || p.assignedSensor.name) + ']';
          }
          html += '<option value="' + p.bcmGpio + '" ' + (isSelected ? 'selected' : '') + '>' +
            'GPIO ' + p.bcmGpio + ' (Physical Pin ' + p.pinNumber + ')' + assignedLabel +
          '</option>';
        });
        return html;
      }
      const l = document.getElementById('edit-room-light-gpio');
      const t = document.getElementById('edit-room-temp-gpio');
      const a = document.getElementById('edit-room-ac-gpio');
      if (l) l.innerHTML = buildOpts(room.light_gpio);
      if (t) t.innerHTML = buildOpts(room.temp_gpio);
      if (a) a.innerHTML = buildOpts(room.ac_gpio);
    }

    function openEditRoomModal(roomId) {
      const room = (state.rooms || []).find(r => r.id === roomId);
      if (!room) return;

      document.getElementById('edit-room-id').value = room.id;
      document.getElementById('edit-room-name').value = room.name || '';
      document.getElementById('edit-room-desc').value = room.description || '';
      const iconSel = document.getElementById('edit-room-icon');
      if (iconSel && room.icon) iconSel.value = room.icon;

      // Determine camera type: RPi CSI vs Tapo RTSP vs None
      let camType = 'none';
      if (room.camera_type === 'rpi' || room.camera_ip === 'rpi-camera' || (room.camera_stream_url && room.camera_stream_url.startsWith('rpicam'))) {
        camType = 'rpi';
      } else if (room.camera_enabled || room.camera_ip || (room.camera_stream_url && room.camera_stream_url.startsWith('rtsp'))) {
        camType = 'tapo';
      }

      const camSel = document.getElementById('edit-room-cam-type');
      if (camSel) {
        camSel.value = camType;
        handleCamTypeChange('edit');
      }

      const ipInput = document.getElementById('edit-room-cam-ip');
      const userInput = document.getElementById('edit-room-cam-user');
      const passInput = document.getElementById('edit-room-cam-pass');
      const streamInput = document.getElementById('edit-room-stream-url');

      if (ipInput) ipInput.value = camType === 'rpi' ? '' : (room.camera_ip || '');
      if (userInput) userInput.value = camType === 'rpi' ? '' : (room.camera_username || '');
      if (passInput) passInput.value = camType === 'rpi' ? '' : (room.camera_password || '');
      if (streamInput) streamInput.value = camType === 'rpi' ? '' : (room.camera_stream_url || '');

      const sub = document.getElementById('edit-room-subtitle');
      if (sub) sub.textContent = 'Configure parameters & hardware links for ' + room.name;

      populateEditRoomGpioDropdowns(room);

      const modal = document.getElementById('edit-room-modal');
      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
      }
    }

    function closeEditRoomModal() {
      const modal = document.getElementById('edit-room-modal');
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    }

    async function handleEditRoom(e) {
      e.preventDefault();
      const roomId = document.getElementById('edit-room-id').value;
      if (!roomId) return;

      const name = document.getElementById('edit-room-name').value.trim();
      const description = document.getElementById('edit-room-desc').value.trim();
      const icon = document.getElementById('edit-room-icon').value;

      const camType = document.getElementById('edit-room-cam-type')?.value || 'none';
      let camera_ip = null;
      let camera_username = null;
      let camera_password = null;
      let camera_stream_url = null;
      let camera_enabled = false;

      if (camType === 'rpi') {
        camera_ip = 'rpi-camera';
        camera_stream_url = 'rpicam://0';
        camera_enabled = true;
      } else if (camType === 'tapo') {
        camera_ip = document.getElementById('edit-room-cam-ip')?.value.trim() || null;
        camera_username = document.getElementById('edit-room-cam-user')?.value.trim() || null;
        camera_password = document.getElementById('edit-room-cam-pass')?.value.trim() || null;
        camera_stream_url = document.getElementById('edit-room-stream-url')?.value.trim() || null;
        camera_enabled = Boolean(camera_ip);
      }
      
      const lightVal = document.getElementById('edit-room-light-gpio').value;
      const tempVal = document.getElementById('edit-room-temp-gpio').value;
      const acVal = document.getElementById('edit-room-ac-gpio').value;

      const light_gpio = lightVal !== '' ? parseInt(lightVal, 10) : null;
      const temp_gpio = tempVal !== '' ? parseInt(tempVal, 10) : null;
      const ac_gpio = acVal !== '' ? parseInt(acVal, 10) : null;

      const btn = document.getElementById('edit-room-save-btn');
      if (btn) {
        btn.textContent = 'Saving...';
        btn.disabled = true;
      }

      try {
        const res = await fetch('/api/rooms/' + roomId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            description,
            icon,
            camera_type: camType,
            camera_enabled,
            camera_ip,
            camera_username,
            camera_password,
            camera_stream_url,
            light_gpio,
            temp_gpio,
            ac_gpio
          })
        });

        if (!res.ok) {
          const err = await res.json();
          alert('Failed to update room: ' + (err.error || 'Server error'));
          return;
        }

        const data = await res.json();
        if (data.rooms) state.rooms = data.rooms;
        closeEditRoomModal();
        await fetchRooms();
        if (typeof fetchPins === 'function') await fetchPins();
      } catch (err) {
        alert('Error: ' + err.message);
      } finally {
        if (btn) {
          btn.textContent = 'Save Changes';
          btn.disabled = false;
        }
      }
    }

    async function handleDeleteRoom(roomId, roomName) {
      if (!confirm('Are you sure you want to delete room "' + (roomName || roomId) + '" from Supabase?\\n\\nAny assigned hardware GPIO pins will be cleanly released.')) {
        return;
      }
      try {
        const res = await fetch('/api/rooms/' + roomId, {
          method: 'DELETE'
        });
        if (!res.ok) {
          const err = await res.json();
          alert('Failed to delete room: ' + (err.error || 'Server error'));
          return;
        }
        const data = await res.json();
        if (data.rooms) state.rooms = data.rooms;
        await fetchRooms();
        if (typeof fetchPins === 'function') await fetchPins();
      } catch (err) {
        alert('Delete failed: ' + err.message);
      }
    }

    function handleDeleteRoomFromModal() {
      const roomId = document.getElementById('edit-room-id').value;
      const room = (state.rooms || []).find(r => r.id === roomId);
      closeEditRoomModal();
      handleDeleteRoom(roomId, room ? room.name : roomId);
    }

    window.handleCamTypeChange = handleCamTypeChange;
    window.handleTapoCredentialsInput = handleTapoCredentialsInput;
    window.openCreateRoomModal = openCreateRoomModal;
    window.closeCreateRoomModal = closeCreateRoomModal;
    window.handleCreateRoom = handleCreateRoom;
    window.openEditRoomModal = openEditRoomModal;
    window.closeEditRoomModal = closeEditRoomModal;
    window.handleEditRoom = handleEditRoom;
    window.handleDeleteRoom = handleDeleteRoom;
    window.handleDeleteRoomFromModal = handleDeleteRoomFromModal;
`;
