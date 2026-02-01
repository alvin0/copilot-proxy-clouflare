export const tokenPageScript = `
  const editButton = document.getElementById('token-edit');
  const editor = document.getElementById('token-editor');
  const form = document.getElementById('token-form');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const passwordGenerate = document.getElementById('password-generate');
  const tokenInput = document.getElementById('token');
  const startButton = document.getElementById('device-start');
  const cancelButton = document.getElementById('device-cancel');
  const devicePanel = document.getElementById('device-panel');
  const deviceStatus = document.getElementById('device-status');
  const userCodeEl = document.getElementById('device-user-code');
  const verificationLink = document.getElementById('device-verification-link');
  const openLink = document.getElementById('device-open-link');
  const deleteUserDialog = document.getElementById('delete-user-modal');
  const deleteUserCancel = document.getElementById('delete-user-cancel');
  const deleteUserUsernameEl = document.getElementById('delete-user-username');
  const deleteUserUsernameInput = document.getElementById('delete-user-username-input');
  const deleteUserPasswordInput = document.getElementById('delete-user-password');

  if (editButton && editor) {
    editButton.addEventListener('click', () => {
      editor.classList.remove('hidden');
      editButton.classList.add('hidden');
      if (tokenInput && typeof tokenInput.focus === 'function') tokenInput.focus();
    });
  }

  if (!form || !tokenInput || !startButton || !devicePanel) {
    // Missing expected DOM; nothing to wire up.
  } else {
    const state = {
      deviceCode: null,
      intervalSeconds: 5,
      expiresAtMs: 0,
      pollTimer: null,
      abort: false
    };

    function setStatus(text) {
      if (!deviceStatus) return;
      deviceStatus.textContent = text || '';
    }

    function setRunning(running) {
      startButton.disabled = running;
      if (cancelButton) cancelButton.disabled = !running;
    }

    function clearTimer() {
      if (state.pollTimer) clearTimeout(state.pollTimer);
      state.pollTimer = null;
    }

    function resetFlow() {
      state.deviceCode = null;
      state.expiresAtMs = 0;
      state.intervalSeconds = 5;
      state.abort = false;
      clearTimer();
      setRunning(false);
    }

    function sanitizeUsername(value) {
      return String(value || '')
        .toLowerCase()
        .replace(/\\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    }

    function generatePassword() {
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      const bytes = new Uint8Array(10);
      crypto.getRandomValues(bytes);
      let body = '';
      for (const b of bytes) {
        body += alphabet[b % alphabet.length];
      }
      return 'acpc-' + body;
    }

    function safeJson(resp) {
      return resp.json().catch(() => null);
    }

    async function pollOnce() {
      if (state.abort) return;
      if (!state.deviceCode) return;
      if (Date.now() >= state.expiresAtMs) {
        setStatus('Device code expired. Please start again.');
        resetFlow();
        return;
      }

      let resp;
      try {
        resp = await fetch('/github/poll-device-code', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ device_code: state.deviceCode })
        });
      } catch (e) {
        setStatus('Network error while polling. Retrying...');
        state.pollTimer = setTimeout(pollOnce, Math.max(1, state.intervalSeconds) * 1000);
        return;
      }

      const data = await safeJson(resp) || {};

      if (resp.status === 200 && data && typeof data.access_token === 'string' && data.access_token) {
        setStatus('Authorized. Token filled. Please enter username/password and save.');
        tokenInput.value = data.access_token;
        return;
      }

      const error = (data && typeof data.error === 'string' && data.error) ? data.error : '';
      if (resp.status === 202 || error === 'authorization_pending') {
        setStatus('Waiting for authorization in GitHub...');
        state.pollTimer = setTimeout(pollOnce, Math.max(1, state.intervalSeconds) * 1000);
        return;
      }
      if (resp.status === 429 || error === 'slow_down') {
        const serverInterval = Number(data && data.interval);
        const nextInterval = Number.isFinite(serverInterval) && serverInterval > 0 ? serverInterval : (state.intervalSeconds + 5);
        state.intervalSeconds = Math.min(60, Math.max(state.intervalSeconds + 1, nextInterval));
        setStatus('GitHub asked to slow down. Retrying...');
        state.pollTimer = setTimeout(pollOnce, state.intervalSeconds * 1000);
        return;
      }
      if (resp.status === 403 || error === 'access_denied') {
        setStatus('Access denied in GitHub. Please start again.');
        resetFlow();
        return;
      }
      if (resp.status === 410 || error === 'expired_token') {
        setStatus('Device code expired. Please start again.');
        resetFlow();
        return;
      }

      const desc = (data && typeof data.error_description === 'string') ? data.error_description : '';
      setStatus('Device flow failed. ' + (desc || ('HTTP ' + resp.status)));
      resetFlow();
    }

    async function startFlow() {
      resetFlow();
      setRunning(true);
      setStatus('Requesting device code...');
      devicePanel.classList.remove('hidden');

      let resp;
      try {
        resp = await fetch('/github/get-device-code', { method: 'POST' });
      } catch (e) {
        setStatus('Network error. Please try again.');
        resetFlow();
        return;
      }

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        setStatus('Failed to get device code. ' + (text || ('HTTP ' + resp.status)));
        resetFlow();
        return;
      }

      const data = await safeJson(resp);
      if (!data || typeof data.device_code !== 'string' || typeof data.user_code !== 'string') {
        setStatus('Unexpected response from server. Please try again.');
        resetFlow();
        return;
      }

      state.deviceCode = data.device_code;
      const interval = Number(data.interval);
      state.intervalSeconds = Number.isFinite(interval) && interval > 0 ? interval : 5;
      const expiresIn = Number(data.expires_in);
      const expiresMs = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : (15 * 60 * 1000);
      state.expiresAtMs = Date.now() + expiresMs;

      if (userCodeEl) userCodeEl.textContent = data.user_code;
      const uri = typeof data.verification_uri === 'string' ? data.verification_uri : 'https://github.com/login/device';
      if (verificationLink) verificationLink.setAttribute('href', uri);
      if (openLink) openLink.setAttribute('href', uri);

      setStatus('Open GitHub, enter the code, then wait here...');
      // Start polling (wait one interval to avoid immediate slow_down).
      state.pollTimer = setTimeout(pollOnce, Math.max(1, state.intervalSeconds) * 1000);
    }

    startButton.addEventListener('click', (e) => {
      e.preventDefault();
      startFlow();
    });

    if (usernameInput) {
      usernameInput.addEventListener('input', () => {
        const raw = usernameInput.value;
        usernameInput.value = raw.toLowerCase().replace(/[^a-z0-9-]/g, '');
      });
      usernameInput.addEventListener('blur', () => {
        const raw = usernameInput.value;
        const next = raw
          .toLowerCase()
          .replace(/\\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
          .replace(/-+/g, '-');
        usernameInput.value = next;
      });
    }

    if (passwordGenerate && passwordInput) {
      const ensurePassword = () => {
        if (!passwordInput.value) passwordInput.value = generatePassword();
      };
      ensurePassword();
      passwordGenerate.addEventListener('click', (e) => {
        e.preventDefault();
        passwordInput.value = generatePassword();
        passwordInput.focus();
        passwordInput.select();
      });
    }

    if (cancelButton) {
      cancelButton.addEventListener('click', (e) => {
        e.preventDefault();
        state.abort = true;
        setStatus('Canceled.');
        resetFlow();
        if (devicePanel) devicePanel.classList.add('hidden');
      });
    }
  }

  // Registered keys delete modal (one shared dialog).
  if (deleteUserDialog && typeof deleteUserDialog.showModal === 'function') {
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!target || typeof target.closest !== 'function') return;
      const btn = target.closest('[data-delete-user]');
      if (!btn) return;
      e.preventDefault();

      const username = btn.getAttribute('data-username') || '';
      if (deleteUserUsernameEl) deleteUserUsernameEl.textContent = username;
      if (deleteUserUsernameInput) deleteUserUsernameInput.value = username;
      if (deleteUserPasswordInput) deleteUserPasswordInput.value = '';

      deleteUserDialog.showModal();
      if (deleteUserPasswordInput && typeof deleteUserPasswordInput.focus === 'function') {
        deleteUserPasswordInput.focus();
      }
    });

    if (deleteUserCancel) {
      deleteUserCancel.addEventListener('click', (e) => {
        e.preventDefault();
        deleteUserDialog.close();
      });
    }
  }
`;
