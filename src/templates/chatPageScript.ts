export const chatPageScript = `
  const form = document.getElementById('chat-form');
  const promptEl = document.getElementById('prompt');
  const messagesEl = document.getElementById('messages');
  const modelEl = document.getElementById('model');
  const streamEl = document.getElementById('stream');
  const contextWindowEl = document.getElementById('context-window');
  const loadingEl = document.getElementById('loading');
  const modelSupportsEl = document.getElementById('model-supports');
  const attachmentsEl = document.getElementById('attachments');
  const toastEl = document.getElementById('toast');
  const fileInputEl = document.getElementById('file-input');
  const clearChatEl = document.getElementById('clear-chat');
  const clearModalEl = document.getElementById('clear-modal');
  const cancelClearEl = document.getElementById('cancel-clear');
  const confirmClearEl = document.getElementById('confirm-clear');
  const submitButton = form.querySelector('button[type="submit"]');
  const username = document.body?.dataset?.username || '';
  const password = document.body?.dataset?.password || '';
  const apiBase = username ? '/' + username : '';
  const authHeader = password ? { Authorization: 'Bearer ' + password } : {};

  const state = { messages: [], isSending: false, images: [], files: [], toastTimer: null };

  function renderMarkdown(content) {
    if (!window.marked) return content;
    const html = window.marked.parse(content);
    return window.DOMPurify ? window.DOMPurify.sanitize(html) : html;
  }

  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      toastEl.classList.add('hidden');
    }, 2400);
  }

  function buildUserContentPreview(contentParts) {
    if (!Array.isArray(contentParts)) return null;
    const wrapper = document.createElement('div');
    wrapper.className = 'mt-2 space-y-2';
    const textPart = contentParts.find(part => part.type === 'text' && part.text);
    if (textPart) {
      const textEl = document.createElement('div');
      textEl.className = 'whitespace-pre-wrap text-sm text-slate-100';
      textEl.textContent = textPart.text;
      wrapper.appendChild(textEl);
    }
    const images = contentParts.filter(part => part.type === 'image_url');
    if (images.length > 0) {
      const imagesWrap = document.createElement('div');
      imagesWrap.className = 'flex flex-wrap gap-2';
      for (const image of images) {
        const img = document.createElement('img');
        img.src = image.image_url?.url || '';
        img.alt = 'uploaded-image';
        img.className = 'h-16 w-16 rounded-lg border border-slate-800 object-cover';
        imagesWrap.appendChild(img);
      }
      wrapper.appendChild(imagesWrap);
    }
    const files = contentParts.filter(part => part.type === 'file');
    if (files.length > 0) {
      const fileWrap = document.createElement('div');
      fileWrap.className = 'flex flex-wrap gap-2 text-[11px] text-slate-300';
      for (const file of files) {
        const chip = document.createElement('span');
        chip.className = 'rounded-full border border-slate-800 bg-slate-900/60 px-2 py-1';
        chip.textContent = file.file?.filename || 'file';
        fileWrap.appendChild(chip);
      }
      wrapper.appendChild(fileWrap);
    }
    return wrapper;
  }

  function createMessageElement(role, content) {
    const wrapper = document.createElement('div');
    wrapper.className = 'rounded-xl border border-slate-800 bg-slate-950/40 p-4';
    wrapper.setAttribute('data-role', role);
    const title = document.createElement('div');
    title.className = 'text-xs font-semibold uppercase tracking-wide text-slate-400';
    title.textContent = role;
    const body = document.createElement('div');
    body.className = 'mt-2 whitespace-pre-wrap text-sm text-slate-100 prose prose-invert max-w-none';
    if (role === 'assistant') {
      body.innerHTML = renderMarkdown(content);
    } else if (content && content.parts) {
      const preview = buildUserContentPreview(content.parts);
      if (preview) body.appendChild(preview);
    } else {
      body.textContent = content;
    }
    wrapper.appendChild(title);
    wrapper.appendChild(body);
    return { wrapper, body };
  }

  function appendMessage(role, content) {
    const { wrapper, body } = createMessageElement(role, content);
    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return body;
  }

  function setSending(isSending) {
    state.isSending = isSending;
    if (submitButton) submitButton.disabled = isSending;
    promptEl.disabled = isSending;
    if (loadingEl) {
      loadingEl.classList.toggle('hidden', !isSending);
      loadingEl.classList.toggle('flex', isSending);
    }
  }

  function selectedModelSupportsImages() {
    const selectedOption = modelEl.options[modelEl.selectedIndex];
    return selectedOption?.dataset.supports === 'Images';
  }

  function getSupportedMediaTypes() {
    const selectedOption = modelEl.options[modelEl.selectedIndex];
    const raw = selectedOption?.dataset.mediaTypes || '';
    if (!raw) return [];
    return raw.split(',').map(item => item.trim()).filter(Boolean);
  }

  function getMaxPromptImages() {
    const selectedOption = modelEl.options[modelEl.selectedIndex];
    const raw = selectedOption?.dataset.maxImages || '';
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  function renderAttachments() {
    if (!attachmentsEl) return;
    attachmentsEl.innerHTML = '';
    if (state.images.length === 0 && state.files.length === 0) {
      attachmentsEl.classList.add('hidden');
      return;
    }
    attachmentsEl.classList.remove('hidden');
    for (const image of state.images) {
      const wrapper = document.createElement('div');
      wrapper.className = 'relative overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60';
      const img = document.createElement('img');
      img.src = image.dataUrl;
      img.alt = image.name || 'pasted-image';
      img.className = 'h-16 w-16 object-cover';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'absolute right-1 top-1 rounded-full bg-slate-900/80 px-1.5 text-[10px] text-slate-200 hover:bg-slate-800';
      remove.textContent = 'x';
      remove.addEventListener('click', () => {
        state.images = state.images.filter(item => item !== image);
        renderAttachments();
      });
      wrapper.appendChild(img);
      wrapper.appendChild(remove);
      attachmentsEl.appendChild(wrapper);
    }
    for (const file of state.files) {
      const wrapper = document.createElement('div');
      wrapper.className = 'flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-[11px] text-slate-200';
      const name = document.createElement('span');
      name.textContent = file.name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'rounded-full bg-slate-900/80 px-1.5 text-[10px] text-slate-200 hover:bg-slate-800';
      remove.textContent = 'x';
      remove.addEventListener('click', () => {
        state.files = state.files.filter(item => item !== file);
        renderAttachments();
      });
      wrapper.appendChild(name);
      wrapper.appendChild(remove);
      attachmentsEl.appendChild(wrapper);
    }
  }

  async function addImageFromFile(file) {
    if (!file || !file.type || !file.type.startsWith('image/')) return;
    if (!selectedModelSupportsImages()) {
      showToast('Selected model does not support images.');
      return;
    }
    const supportedTypes = getSupportedMediaTypes();
    if (supportedTypes.length > 0 && !supportedTypes.includes(file.type)) {
      showToast('Image type not supported by selected model.');
      return;
    }
    const maxImages = getMaxPromptImages();
    if (typeof maxImages === 'number' && state.images.length >= maxImages) {
      showToast('Selected model supports fewer images. Extra image removed.');
      return;
    }
    const maxSizeBytes = 5 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      appendMessage('error', 'Image too large. Max 5MB.');
      return;
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    state.images.push({ dataUrl, name: file.name, type: file.type });
    renderAttachments();
  }

  function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  async function addFileFromFile(file) {
    if (!file) return;
    const supportedTypes = getSupportedMediaTypes();
    if (supportedTypes.length > 0 && (!file.type || !supportedTypes.includes(file.type))) {
      showToast('File type not supported by selected model.');
      return;
    }
    const maxSizeBytes = 10 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      appendMessage('error', 'File too large. Max 10MB.');
      return;
    }
    const buffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
    const base64 = arrayBufferToBase64(buffer);
    state.files.push({ name: file.name, type: file.type, base64 });
    renderAttachments();
  }

  function updateModelSupports() {
    if (!modelSupportsEl) return;
    const selectedOption = modelEl.options[modelEl.selectedIndex];
    if (!selectedOption) return;
    const supports = selectedOption.dataset.supports || 'Text only';
    const details = selectedOption.dataset.supportsDetail;
    modelSupportsEl.textContent = details
      ? \`Supports: \${supports} (\${details})\`
      : \`Supports: \${supports}\`;
    if (state.images.length > 0 && supports !== 'Images') {
      showToast('Selected model does not support images.');
    }
    const supportedTypes = getSupportedMediaTypes();
    if (state.images.length > 0 && supportedTypes.length > 0) {
      const before = state.images.length;
      state.images = state.images.filter(image => supportedTypes.includes(image.type));
      if (state.images.length !== before) {
        showToast('Some images were removed (unsupported type).');
      }
    }
    if (state.files.length > 0 && supportedTypes.length > 0) {
      const before = state.files.length;
      state.files = state.files.filter(file => file.type && supportedTypes.includes(file.type));
      if (state.files.length !== before) {
        showToast('Some files were removed (unsupported type).');
      }
    }
    const maxImages = getMaxPromptImages();
    if (typeof maxImages === 'number' && state.images.length > maxImages) {
      state.images = state.images.slice(0, maxImages);
      showToast('Too many images. Extra images were removed.');
    }
    renderAttachments();
    if (contextWindowEl) {
      const contextValue = selectedOption.dataset.contextWindow;
      contextWindowEl.textContent = contextValue ? contextValue : 'N/A';
    }
  }

  promptEl.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    form.requestSubmit();
  });

  promptEl.addEventListener('paste', (event) => {
    const items = event.clipboardData?.items || [];
    const fileItems = Array.from(items).filter(item => item.kind === 'file');
    if (fileItems.length === 0) return;
    event.preventDefault();
    for (const item of fileItems) {
      const file = item.getAsFile();
      if (!file) continue;
      if (file.type && file.type.startsWith('image/')) {
        addImageFromFile(file);
      } else {
        addFileFromFile(file);
      }
    }
  });

  if (fileInputEl) {
    fileInputEl.addEventListener('change', (event) => {
      const input = event.target;
      const files = input.files ? Array.from(input.files) : [];
      for (const file of files) {
        if (file.type && file.type.startsWith('image/')) {
          addImageFromFile(file);
        } else {
          addFileFromFile(file);
        }
      }
      input.value = '';
    });
  }

  function closeClearModal() {
    if (clearModalEl) clearModalEl.classList.add('hidden');
  }

  function openClearModal() {
    if (clearModalEl) clearModalEl.classList.remove('hidden');
  }

  if (clearChatEl) {
    clearChatEl.addEventListener('click', () => {
      openClearModal();
    });
  }

  if (cancelClearEl) {
    cancelClearEl.addEventListener('click', () => {
      closeClearModal();
    });
  }

  if (confirmClearEl) {
    confirmClearEl.addEventListener('click', () => {
      state.messages = [];
      state.images = [];
      state.files = [];
      if (messagesEl) messagesEl.innerHTML = '';
      renderAttachments();
      if (loadingEl) loadingEl.classList.add('hidden');
      closeClearModal();
    });
  }

  if (clearModalEl) {
    clearModalEl.addEventListener('click', (event) => {
      if (event.target === clearModalEl) {
        closeClearModal();
      }
    });
  }

  function handleDroppedFiles(fileList) {
    const files = Array.from(fileList || []);
    for (const file of files) {
      if (file.type && file.type.startsWith('image/')) {
        addImageFromFile(file);
      } else {
        addFileFromFile(file);
      }
    }
  }

  form.addEventListener('dragover', (event) => {
    event.preventDefault();
    form.classList.add('ring-2', 'ring-cyan-400/60');
  });

  form.addEventListener('dragleave', () => {
    form.classList.remove('ring-2', 'ring-cyan-400/60');
  });

  form.addEventListener('drop', (event) => {
    event.preventDefault();
    form.classList.remove('ring-2', 'ring-cyan-400/60');
    handleDroppedFiles(event.dataTransfer?.files);
  });

  modelEl.addEventListener('change', updateModelSupports);
  updateModelSupports();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!username || !password) {
      showToast('Missing username or password. Open /chat?username=...&password=...');
      return;
    }
    const prompt = promptEl.value.trim();
    if (state.images.length > 0 && !selectedModelSupportsImages()) {
      showToast('Selected model does not support images.');
      return;
    }
    const supportedTypes = getSupportedMediaTypes();
    if (supportedTypes.length > 0) {
      const invalidImage = state.images.find(image => !supportedTypes.includes(image.type));
      if (invalidImage) {
        state.images = state.images.filter(image => supportedTypes.includes(image.type));
        renderAttachments();
        showToast('Some images were removed (unsupported type).');
        return;
      }
      const invalidFile = state.files.find(file => !file.type || !supportedTypes.includes(file.type));
      if (invalidFile) {
        state.files = state.files.filter(file => file.type && supportedTypes.includes(file.type));
        renderAttachments();
        showToast('Some files were removed (unsupported type).');
        return;
      }
    }
    const maxImages = getMaxPromptImages();
    if (typeof maxImages === 'number' && state.images.length > maxImages) {
      state.images = state.images.slice(0, maxImages);
      renderAttachments();
      showToast('Too many images. Extra images were removed.');
      return;
    }
    if (state.isSending || (!prompt && state.images.length === 0 && state.files.length === 0)) return;
    setSending(true);
    const model = modelEl.value;
    const contentParts = [];
    if (prompt) {
      contentParts.push({ type: 'text', text: prompt });
    }
    for (const image of state.images) {
      contentParts.push({
        type: 'image_url',
        image_url: { url: image.dataUrl }
      });
    }
    for (const file of state.files) {
      contentParts.push({
        type: 'file',
        file: {
          filename: file.name,
          file_data: file.base64
        }
      });
    }
    const userMessage = {
      role: 'user',
      content: contentParts.length > 0 ? contentParts : prompt
    };
    state.messages.push(userMessage);
    appendMessage('user', {
      text: prompt,
      parts: contentParts
    });
    promptEl.value = '';
    state.images = [];
    state.files = [];
    renderAttachments();

    const payload = {
      model: model || undefined,
      stream: !!streamEl.checked,
      messages: state.messages
    };

    if (!payload.stream) {
      try {
        const res = await fetch(apiBase + '/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          appendMessage('error', await res.text());
          return;
        }
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || '';
        // context window is shown via model selection, no usage display
        state.messages.push({ role: 'assistant', content });
        appendMessage('assistant', content);
      } finally {
        setSending(false);
      }
      return;
    }

    try {
      const res = await fetch(apiBase + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify(payload)
      });
      if (!res.ok || !res.body) {
        appendMessage('error', await res.text());
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';
      const assistantIndex = state.messages.length;
      state.messages.push({ role: 'assistant', content: '' });
      const assistantBodyEl = appendMessage('assistant', '');
      if (loadingEl) loadingEl.classList.add('hidden');
      let usageTokens = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) assistantContent += delta;
            // ignore usage in stream; context window is displayed instead
          } catch (_) {}
        }
        state.messages[assistantIndex].content = assistantContent;
        assistantBodyEl.innerHTML = renderMarkdown(assistantContent);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
      if (contextWindowEl) {
        const selectedOption = modelEl.options[modelEl.selectedIndex];
        const contextValue = selectedOption?.dataset.contextWindow;
        contextWindowEl.textContent = contextValue ? contextValue : 'N/A';
      }
    } finally {
      setSending(false);
    }
  });
`;
