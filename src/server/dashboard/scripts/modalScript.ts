export const modalScript = `
    async function triggerManualSync() {
      try {
        const res = await fetch('/api/sync/trigger', { method: 'POST' });
        const data = await res.json();
        alert(data.success ? 'Telemetry synced to Smarter-Home successfully!' : 'Sync trigger completed.');
      } catch (err) {
        alert('Sync error: ' + err.message);
      }
    }

    function openAddSensorModal(selectedPin) {
      const pinSelect = document.getElementById('modal-sensor-pin');
      pinSelect.innerHTML = '';
      state.pins.filter(p => p.capabilities.includes('GPIO')).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.pinNumber;
        opt.textContent = 'Pin ' + p.pinNumber + ' (' + p.name + ')' + (p.assignedSensorId ? ' - Currently Assigned' : '');
        if (selectedPin && p.pinNumber === selectedPin) opt.selected = true;
        pinSelect.appendChild(opt);
      });

      const roomSelect = document.getElementById('modal-sensor-room');
      if (roomSelect) {
        roomSelect.innerHTML = '<option value="">-- Standalone Sensor (No Room) --</option>';
        (state.rooms || []).forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.id;
          opt.textContent = r.name;
          roomSelect.appendChild(opt);
        });
      }

      document.getElementById('sensor-modal').classList.remove('hidden');
      document.getElementById('sensor-modal').classList.add('flex');
    }

    function closeAddSensorModal() {
      document.getElementById('sensor-modal').classList.add('hidden');
      document.getElementById('sensor-modal').classList.remove('flex');
    }

    function handleTypeChange() {
      const type = document.getElementById('modal-sensor-type').value;
      const pinGroup = document.getElementById('modal-pin-group');
      if (type === 'camera') {
        pinGroup.classList.add('hidden');
      } else {
        pinGroup.classList.remove('hidden');
      }
    }

    async function handleSaveSensor(e) {
      e.preventDefault();
      const name = document.getElementById('modal-sensor-name').value;
      const type = document.getElementById('modal-sensor-type').value;
      const pinNumber = type === 'camera' ? undefined : parseInt(document.getElementById('modal-sensor-pin').value, 10);
      const roomId = document.getElementById('modal-sensor-room') ? document.getElementById('modal-sensor-room').value : '';
      const pollIntervalMs = parseInt(document.getElementById('modal-poll-interval').value, 10);

      try {
        const pin = state.pins.find(p => p.pinNumber === pinNumber);
        const bcmGpio = pin ? pin.bcmGpio : undefined;

        // If attached to a Supabase Room, save directly into Supabase rooms table
        if (roomId && bcmGpio !== undefined && bcmGpio !== null) {
          const prop = type === 'temperature' ? 'temp_gpio' : (type === 'relay' && name.toLowerCase().includes('ac')) ? 'ac_gpio' : 'light_gpio';
          await fetch('/api/pins/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId, property: prop, bcmGpio })
          });
        }

        const res = await fetch('/api/sensors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            type,
            pinNumber,
            pollIntervalMs,
            options: roomId ? { roomId, source: 'supabase' } : {}
          })
        });
        if (!res.ok) {
          const err = await res.json();
          alert('Error: ' + err.error);
          return;
        }
        closeAddSensorModal();
        await fetchPins();
      } catch (err) {
        alert('Failed: ' + err.message);
      }
    }

    function openRoomGpioModal(roomId, targetFocus) {
      const modal = document.getElementById('room-gpio-modal');
      if (!modal) return;

      const roomSelect = document.getElementById('room-gpio-room-select');
      roomSelect.innerHTML = '';
      (state.rooms || []).forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name;
        if (r.id === roomId) opt.selected = true;
        roomSelect.appendChild(opt);
      });

      const activeRoomId = roomId || (state.rooms && state.rooms[0] ? state.rooms[0].id : '');
      document.getElementById('room-gpio-room-id').value = activeRoomId;

      populateRoomGpioDropdowns(activeRoomId);

      modal.classList.remove('hidden');
      modal.classList.add('flex');

      if (targetFocus === 'temp') {
        const el = document.getElementById('room-gpio-temp-select');
        if (el) el.focus();
      } else if (targetFocus === 'light') {
        const el = document.getElementById('room-gpio-light-select');
        if (el) el.focus();
      }
    }

    function populateRoomGpioDropdowns(roomId) {
      const room = (state.rooms || []).find(r => r.id === roomId);
      const subtitle = document.getElementById('room-gpio-subtitle');
      if (subtitle && room) {
        subtitle.textContent = 'Hardware GPIO assignments for ' + room.name + ' in Supabase';
      }

      const gpioPins = (state.pins || []).filter(p => p.capabilities && p.capabilities.includes('GPIO'));

      function buildOptions(currentGpio) {
        let html = '<option value="">-- Disconnected / No Sensor --</option>';
        gpioPins.forEach(p => {
          const isSelected = currentGpio !== null && currentGpio !== undefined && currentGpio !== '' && parseInt(currentGpio) === p.bcmGpio;
          let assignedLabel = '';
          if (p.assignedSensor) {
            const isThisRoom = p.assignedSensor.roomId === roomId;
            assignedLabel = isThisRoom ? ' [Current ' + (p.assignedSensor.type || '') + ']' : ' [Assigned: ' + (p.assignedSensor.roomName || p.assignedSensor.name) + ']';
          }
          html += '<option value="' + p.bcmGpio + '" ' + (isSelected ? 'selected' : '') + '>' +
            'GPIO ' + p.bcmGpio + ' (Physical Pin ' + p.pinNumber + ')' + assignedLabel +
          '</option>';
        });
        return html;
      }

      const lightSel = document.getElementById('room-gpio-light-select');
      const tempSel = document.getElementById('room-gpio-temp-select');
      const acSel = document.getElementById('room-gpio-ac-select');

      if (lightSel) lightSel.innerHTML = buildOptions(room ? room.light_gpio : null);
      if (tempSel) tempSel.innerHTML = buildOptions(room ? room.temp_gpio : null);
      if (acSel) acSel.innerHTML = buildOptions(room ? room.ac_gpio : null);
    }

    function handleRoomSelectChange() {
      const roomSelect = document.getElementById('room-gpio-room-select');
      const roomId = roomSelect.value;
      document.getElementById('room-gpio-room-id').value = roomId;
      populateRoomGpioDropdowns(roomId);
    }

    function closeRoomGpioModal() {
      const modal = document.getElementById('room-gpio-modal');
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    }

    async function handleSaveRoomGpio(e) {
      e.preventDefault();
      const roomId = document.getElementById('room-gpio-room-id').value;
      if (!roomId) {
        alert('Please select a room.');
        return;
      }

      const lightVal = document.getElementById('room-gpio-light-select').value;
      const tempVal = document.getElementById('room-gpio-temp-select').value;
      const acVal = document.getElementById('room-gpio-ac-select').value;

      const light_gpio = lightVal !== '' ? parseInt(lightVal, 10) : null;
      const temp_gpio = tempVal !== '' ? parseInt(tempVal, 10) : null;
      const ac_gpio = acVal !== '' ? parseInt(acVal, 10) : null;

      const saveBtn = document.getElementById('room-gpio-save-btn');
      if (saveBtn) {
        saveBtn.textContent = 'Saving to Supabase...';
        saveBtn.disabled = true;
      }

      try {
        const res = await fetch('/api/rooms/' + roomId + '/sensors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ light_gpio, temp_gpio, ac_gpio })
        });

        if (!res.ok) {
          const err = await res.json();
          alert('Failed to update room GPIOs: ' + (err.error || 'Server error'));
          return;
        }

        const data = await res.json();
        if (data.rooms) state.rooms = data.rooms;
        closeRoomGpioModal();
        await fetchRooms();
        if (typeof fetchPins === 'function') await fetchPins();
      } catch (err) {
        alert('Failed: ' + err.message);
      } finally {
        if (saveBtn) {
          saveBtn.textContent = 'Save & Sync to Supabase';
          saveBtn.disabled = false;
        }
      }
    }

    window.openRoomGpioModal = openRoomGpioModal;
    window.closeRoomGpioModal = closeRoomGpioModal;
    window.handleRoomSelectChange = handleRoomSelectChange;
    window.handleSaveRoomGpio = handleSaveRoomGpio;

    function openEnrollFaceModal() {
      state.selectedTrainingPhotos = [];
      document.getElementById('photo-preview-grid').innerHTML = '';
      document.getElementById('photo-count-badge').textContent = '0 / 10 Selected';
      document.getElementById('enroll-modal').classList.remove('hidden');
      document.getElementById('enroll-modal').classList.add('flex');
    }

    function closeEnrollFaceModal() {
      document.getElementById('enroll-modal').classList.add('hidden');
      document.getElementById('enroll-modal').classList.remove('flex');
    }

    async function handlePhotoSelection(e) {
      const files = Array.from(e.target.files);
      const grid = document.getElementById('photo-preview-grid');
      grid.innerHTML = '';
      state.selectedTrainingPhotos = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        reader.onload = (re) => {
          const b64 = re.target.result;
          state.selectedTrainingPhotos.push(b64);
          
          const img = document.createElement('img');
          img.src = b64;
          img.className = 'w-full h-12 object-cover rounded-lg border border-stone-800';
          grid.appendChild(img);

          const count = state.selectedTrainingPhotos.length;
          const badge = document.getElementById('photo-count-badge');
          badge.textContent = count + ' / 10 Selected';
          badge.className = count >= 10 ? 'font-mono text-[10px] text-emerald-400 font-bold' : 'font-mono text-[10px] text-amber-400 font-bold';
        };
        reader.readAsDataURL(file);
      }
    }

    async function handleTrainFace(e) {
      e.preventDefault();
      const name = document.getElementById('modal-face-name').value;
      const notes = document.getElementById('modal-face-notes').value;

      if (state.selectedTrainingPhotos.length < 10) {
        alert('Please select at least 10 different photos of the person for model training.');
        return;
      }

      const submitBtn = document.getElementById('train-submit-btn');
      submitBtn.textContent = 'Training AI Model...';
      submitBtn.disabled = true;

      try {
        const res = await fetch('/api/faces/train', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, notes, photos: state.selectedTrainingPhotos })
        });
        const data = await res.json();
        if (res.ok) {
          alert('Model trained successfully for ' + name + '!');
          closeEnrollFaceModal();
          await fetchFaces();
        } else {
          alert('Training error: ' + data.error);
        }
      } catch (err) {
        alert('Failed: ' + err.message);
      } finally {
        submitBtn.textContent = 'Train AI Model';
        submitBtn.disabled = false;
      }
    }

    async function removeFace(id) {
      if (!confirm('Remove this person from recognized faces?')) return;
      await fetch('/api/faces/' + id, { method: 'DELETE' });
      await fetchFaces();
    }

    async function openTokenModal() {
      try {
        const res = await fetch('/api/config/token');
        if (res.ok) {
          const data = await res.json();
          document.getElementById('modal-cloud-token').value = data.token || '';
          document.getElementById('modal-cloud-url').value = data.apiUrl || '';
        }
      } catch {}
      document.getElementById('token-modal').classList.remove('hidden');
      document.getElementById('token-modal').classList.add('flex');
    }

    function closeTokenModal() {
      document.getElementById('token-modal').classList.add('hidden');
      document.getElementById('token-modal').classList.remove('flex');
    }

    async function handleSaveToken(e) {
      e.preventDefault();
      const token = document.getElementById('modal-cloud-token').value.trim();
      const apiUrl = document.getElementById('modal-cloud-url').value.trim();
      const saveBtn = document.getElementById('token-save-btn');

      saveBtn.textContent = 'Saving...';
      saveBtn.disabled = true;

      try {
        const res = await fetch('/api/config/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, apiUrl })
        });
        const data = await res.json();
        if (res.ok) {
          alert(data.message || 'Token updated successfully!');
          closeTokenModal();
          const btnLabel = document.getElementById('token-btn-label');
          if (btnLabel) {
            btnLabel.textContent = token ? 'Home Linked ✅' : 'Link Home Token';
          }
          await fetchStatus();
        } else {
          alert('Error: ' + data.error);
        }
      } catch (err) {
        alert('Failed to save token: ' + err.message);
      } finally {
        saveBtn.textContent = 'Save & Link';
        saveBtn.disabled = false;
      }
    }

    async function handleClearToken() {
      if (!confirm('Unlink this Raspberry Pi from your Smarter Home Citadel?')) return;
      try {
        const res = await fetch('/api/config/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: '', apiUrl: '' })
        });
        if (res.ok) {
          alert('Token cleared. Raspberry Pi is unlinked.');
          closeTokenModal();
          await fetchStatus();
        }
      } catch (err) {
        alert('Failed: ' + err.message);
      }
    }

    window.openTokenModal = openTokenModal;
    window.closeTokenModal = closeTokenModal;
    window.handleSaveToken = handleSaveToken;
    window.handleClearToken = handleClearToken;
    window.openAddSensorModal = openAddSensorModal;
    window.closeAddSensorModal = closeAddSensorModal;
    window.openEnrollFaceModal = openEnrollFaceModal;
    window.closeEnrollFaceModal = closeEnrollFaceModal;
    window.triggerManualSync = triggerManualSync;
    window.handleTrainFace = handleTrainFace;
    window.handlePhotoSelection = handlePhotoSelection;
    window.removeFace = removeFace;
`;

