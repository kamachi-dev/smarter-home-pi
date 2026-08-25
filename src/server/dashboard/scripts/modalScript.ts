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
      const pollIntervalMs = parseInt(document.getElementById('modal-poll-interval').value, 10);

      try {
        const res = await fetch('/api/sensors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, type, pinNumber, pollIntervalMs })
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
`;

