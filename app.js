// app.js - ゆらぎめーかー メインロジック

(function() {
  'use strict';

  // ===== 状態 =====
  let activePreset = null;
  let sleepTimerId = null;
  let sleepEndTime = null;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ===== 初期化 =====
  function init() {
    renderSoundCards();
    renderPresets();
    setupEventListeners();
    loadSavedState();
  }

  // ===== サウンドカード描画 =====
  function renderSoundCards() {
    const grid = $('#sound-grid');
    grid.innerHTML = SOUND_LIBRARY.map(sound => `
      <div class="sound-card" data-id="${sound.id}" id="card-${sound.id}">
        <span class="sound-icon">${sound.icon}</span>
        <span class="sound-name">${sound.name}</span>
        <div class="sound-volume">
          <input type="range" class="volume-slider" data-id="${sound.id}" 
                 min="0" max="100" value="50" />
        </div>
      </div>
    `).join('');
  }

  // ===== プリセット描画 =====
  function renderPresets() {
    const list = $('#preset-list');
    const allPresets = getAllPresets();
    const userPresets = loadUserPresets();

    list.innerHTML = allPresets.map(p => {
      const isUser = userPresets.some(up => up.id === p.id);
      return `
        <button class="preset-tag ${isUser ? 'user-preset' : ''} ${activePreset === p.id ? 'active' : ''}" 
                data-preset="${p.id}">
          ${p.icon || ''} ${p.name}
          ${isUser ? '<span class="delete-preset" data-delete="' + p.id + '">✕</span>' : ''}
        </button>
      `;
    }).join('');
  }

  // ===== サウンド制御 =====
  function toggleSound(id) {
    if (AudioEngine.isPlaying(id)) {
      AudioEngine.stop(id);
      $(`#card-${id}`).classList.remove('active');
    } else {
      const slider = $(`[data-id="${id}"].volume-slider`);
      const vol = slider ? parseInt(slider.value) / 100 : 0.5;
      AudioEngine.play(id);
      AudioEngine.setVolume(id, vol);
      $(`#card-${id}`).classList.add('active');
    }

    activePreset = null;
    $$('.preset-tag').forEach(t => t.classList.remove('active'));
    saveCurrentState();
  }

  function updateVolume(id, volume) {
    AudioEngine.setVolume(id, volume / 100);
  }

  function stopAll() {
    AudioEngine.stopAll();
    $$('.sound-card').forEach(c => c.classList.remove('active'));
    activePreset = null;
    $$('.preset-tag').forEach(t => t.classList.remove('active'));
    saveCurrentState();
  }

  // ===== プリセット適用 =====
  function applyPreset(presetId) {
    const allPresets = getAllPresets();
    const preset = allPresets.find(p => p.id === presetId);
    if (!preset) return;

    // 全停止
    AudioEngine.stopAll();
    $$('.sound-card').forEach(c => c.classList.remove('active'));

    // 音源再生
    for (const s of preset.sounds) {
      // スライダー更新
      const slider = $(`[data-id="${s.id}"].volume-slider`);
      if (slider) slider.value = Math.round(s.volume * 100);

      AudioEngine.play(s.id);
      AudioEngine.setVolume(s.id, s.volume);
      $(`#card-${s.id}`)?.classList.add('active');
    }

    if (preset.masterVolume !== undefined) {
      AudioEngine.setMasterVolume(preset.masterVolume);
      $('#master-volume').value = Math.round(preset.masterVolume * 100);
      $('#master-value').textContent = Math.round(preset.masterVolume * 100) + '%';
    }

    activePreset = presetId;
    $$('.preset-tag').forEach(t => {
      t.classList.toggle('active', t.dataset.preset === presetId);
    });

    saveCurrentState();
  }

  // ===== プリセット保存 =====
  function savePreset(name) {
    if (!name.trim()) return;

    const activeSounds = [];
    $$('.sound-card.active').forEach(card => {
      activeSounds.push(card.dataset.id);
    });

    if (activeSounds.length === 0) return;

    const sounds = activeSounds.map(id => {
      const slider = $(`[data-id="${id}"].volume-slider`);
      return {
        id,
        volume: slider ? parseInt(slider.value) / 100 : 0.5,
      };
    });

    const preset = {
      id: 'user-' + Date.now(),
      name: name.trim(),
      icon: '🎵',
      masterVolume: parseInt($('#master-volume').value) / 100,
      sounds,
    };

    const userPresets = loadUserPresets();
    userPresets.push(preset);
    saveUserPresets(userPresets);
    renderPresets();
  }

  function deletePreset(presetId) {
    const userPresets = loadUserPresets().filter(p => p.id !== presetId);
    saveUserPresets(userPresets);
    if (activePreset === presetId) activePreset = null;
    renderPresets();
  }

  // ===== スリープタイマー =====
  function setSleepTimer(minutes) {
    clearSleepTimer();

    if (minutes <= 0) {
      $('#sleep-text').textContent = 'スリープ';
      $('#sleep-btn').classList.remove('active');
      return;
    }

    sleepEndTime = Date.now() + minutes * 60 * 1000;
    $('#sleep-btn').classList.add('active');

    const updateDisplay = () => {
      const remaining = Math.max(0, sleepEndTime - Date.now());
      if (remaining <= 0) {
        stopAll();
        clearSleepTimer();
        $('#sleep-text').textContent = 'スリープ';
        $('#sleep-btn').classList.remove('active');
        return;
      }

      const mins = Math.ceil(remaining / 60000);
      $('#sleep-text').textContent = `${mins}分`;
      sleepTimerId = requestAnimationFrame(updateDisplay);
    };

    updateDisplay();
  }

  function clearSleepTimer() {
    if (sleepTimerId) cancelAnimationFrame(sleepTimerId);
    sleepTimerId = null;
    sleepEndTime = null;
  }

  // ===== 状態の保存/読み込み =====
  function saveCurrentState() {
    const activeSounds = [];
    $$('.sound-card.active').forEach(card => {
      const id = card.dataset.id;
      const slider = $(`[data-id="${id}"].volume-slider`);
      activeSounds.push({
        id,
        volume: slider ? parseInt(slider.value) : 50,
      });
    });

    localStorage.setItem('yuragi-state', JSON.stringify({
      activeSounds,
      masterVolume: parseInt($('#master-volume').value),
      activePreset,
    }));
  }

  function loadSavedState() {
    try {
      const state = JSON.parse(localStorage.getItem('yuragi-state') || '{}');
      if (state.masterVolume !== undefined) {
        $('#master-volume').value = state.masterVolume;
        $('#master-value').textContent = state.masterVolume + '%';
        AudioEngine.setMasterVolume(state.masterVolume / 100);
      }
    } catch { /* ignore */ }
  }

  // ===== イベントリスナー =====
  function setupEventListeners() {
    // サウンドカード toggle
    $('#sound-grid').addEventListener('click', (e) => {
      const card = e.target.closest('.sound-card');
      if (!card) return;
      if (e.target.classList.contains('volume-slider')) return;
      toggleSound(card.dataset.id);
    });

    // ボリュームスライダー
    $('#sound-grid').addEventListener('input', (e) => {
      if (!e.target.classList.contains('volume-slider')) return;
      updateVolume(e.target.dataset.id, parseInt(e.target.value));
    });

    // マスターボリューム
    $('#master-volume').addEventListener('input', (e) => {
      const vol = parseInt(e.target.value);
      $('#master-value').textContent = vol + '%';
      AudioEngine.setMasterVolume(vol / 100);
      saveCurrentState();
    });

    // 全停止
    $('#stop-all-btn').addEventListener('click', stopAll);

    // プリセット選択
    $('#preset-list').addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('.delete-preset');
      if (deleteBtn) {
        e.stopPropagation();
        deletePreset(deleteBtn.dataset.delete);
        return;
      }

      const tag = e.target.closest('.preset-tag');
      if (!tag) return;
      applyPreset(tag.dataset.preset);
    });

    // プリセット保存
    $('#preset-save-btn').addEventListener('click', () => {
      const activeSounds = [];
      $$('.sound-card.active').forEach(card => activeSounds.push(card.dataset.id));
      if (activeSounds.length === 0) {
        alert('音を再生してからプリセットを保存してください');
        return;
      }
      $('#save-modal').classList.remove('hidden');
      $('#preset-name-input').value = '';
      $('#preset-name-input').focus();
    });

    $('#save-confirm').addEventListener('click', () => {
      savePreset($('#preset-name-input').value);
      $('#save-modal').classList.add('hidden');
    });

    $('#save-cancel').addEventListener('click', () => {
      $('#save-modal').classList.add('hidden');
    });

    $('#preset-name-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        savePreset($('#preset-name-input').value);
        $('#save-modal').classList.add('hidden');
      }
    });

    $('#save-modal').addEventListener('click', (e) => {
      if (e.target.id === 'save-modal') {
        $('#save-modal').classList.add('hidden');
      }
    });

    // スリープタイマー
    $('#sleep-btn').addEventListener('click', () => {
      $('#sleep-menu').classList.toggle('hidden');
    });

    $$('.sleep-option').forEach(btn => {
      btn.addEventListener('click', () => {
        setSleepTimer(parseInt(btn.dataset.minutes));
        $('#sleep-menu').classList.add('hidden');
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.sleep-timer')) {
        $('#sleep-menu').classList.add('hidden');
      }
    });
  }

  // ===== 起動 =====
  document.addEventListener('DOMContentLoaded', init);
})();
