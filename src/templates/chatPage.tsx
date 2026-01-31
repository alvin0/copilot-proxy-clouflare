import React from "react";
import { renderToString } from "react-dom/server";
import { ModelWithFree } from "../configs/free-models";

type ChatPageState = {
  models: ModelWithFree[];
};

function ChatPage({ state }: { state: ChatPageState }) {
  const modelOptions = state.models.length > 0
    ? state.models.map(model => {
      const vision = model.capabilities?.limits?.vision;
      const supports = vision ? "Images" : "Text only";
      const supportDetails = [];
      if (vision?.max_prompt_images) {
        supportDetails.push(`max ${vision.max_prompt_images.toLocaleString()} images`);
      }
      if (vision?.max_prompt_image_size) {
        supportDetails.push(`max image size ${vision.max_prompt_image_size.toLocaleString()}`);
      }
      const supportsDetailText = supportDetails.length > 0 ? supportDetails.join(", ") : "";
      return (
        <option
          key={model.id}
          value={model.id}
          data-supports={supports}
          data-supports-detail={supportsDetailText}
        >
          {model.name} ({model.id}){model.free ? " - FREE" : ""}
        </option>
      );
    })
    : [
      <option key="none" value="" disabled>No models available</option>
    ];

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Chat</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/dompurify@3.0.6/dist/purify.min.js"></script>
      </head>
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-10">
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
              <p className="mt-1 text-sm text-slate-400">Chat with the current Copilot models.</p>
            </div>
            <a className="text-sm text-cyan-300 hover:text-cyan-200" href="/">Token Setup</a>
          </header>

          <section className="flex flex-1 flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div id="messages" className="flex-1 min-h-0 space-y-4 overflow-y-auto pr-2"></div>
            <div id="loading" className="mt-4 hidden items-center gap-2 text-xs text-slate-400">
              <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400"></span>
              <span>LLM is thinking...</span>
            </div>
          </section>

          <form id="chat-form" className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            <textarea
              id="prompt"
              className="h-16 w-full resize-none bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
              placeholder="Type your message..."
              required
            />
            <div id="attachments" className="mt-3 hidden flex-wrap gap-2"></div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span className="hidden sm:inline">Tokens used: <span id="token-usage" className="text-slate-200">N/A</span></span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs text-slate-200 hover:border-slate-500">
                  <input id="file-input" type="file" className="hidden" />
                  + File
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                  <input id="stream" type="checkbox" checked className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-950/60" />
                  Stream
                </label>
                <select
                  id="model"
                  className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
                >
                  {modelOptions}
                </select>
                <button
                  type="submit"
                  className="rounded-full bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
                >
                  ↑
                </button>
              </div>
            </div>
            <p id="model-supports" className="mt-3 text-xs text-slate-400"></p>
            <p className="mt-1 text-xs text-slate-500">Messages are sent to /v1/chat/completions</p>
          </form>
        </div>

        <div
          id="toast"
          className="pointer-events-none fixed bottom-6 right-6 hidden max-w-sm rounded-xl border border-rose-500/40 bg-rose-500/20 px-4 py-3 text-xs text-rose-100 shadow-lg"
        ></div>

        <script
          dangerouslySetInnerHTML={{
            __html: `
              const form = document.getElementById('chat-form');
              const promptEl = document.getElementById('prompt');
              const messagesEl = document.getElementById('messages');
              const modelEl = document.getElementById('model');
              const streamEl = document.getElementById('stream');
              const tokenUsageEl = document.getElementById('token-usage');
              const loadingEl = document.getElementById('loading');
              const modelSupportsEl = document.getElementById('model-supports');
              const attachmentsEl = document.getElementById('attachments');
              const toastEl = document.getElementById('toast');
              const fileInputEl = document.getElementById('file-input');
              const submitButton = form.querySelector('button[type="submit"]');

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
                const prompt = promptEl.value.trim();
                if (state.images.length > 0 && !selectedModelSupportsImages()) {
                  showToast('Selected model does not support images.');
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
                    const res = await fetch('/v1/chat/completions', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload)
                    });
                    if (!res.ok) {
                      appendMessage('error', await res.text());
                      return;
                    }
                    const data = await res.json();
                    const content = data.choices?.[0]?.message?.content || '';
                    const usage = data.usage?.total_tokens;
                    if (typeof usage === 'number') tokenUsageEl.textContent = String(usage);
                    state.messages.push({ role: 'assistant', content });
                    appendMessage('assistant', content);
                  } finally {
                    setSending(false);
                  }
                  return;
                }

                try {
                  const res = await fetch('/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
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
                        if (typeof json.usage?.total_tokens === 'number') {
                          usageTokens = json.usage.total_tokens;
                        }
                      } catch (_) {}
                    }
                    state.messages[assistantIndex].content = assistantContent;
                    assistantBodyEl.innerHTML = renderMarkdown(assistantContent);
                    messagesEl.scrollTop = messagesEl.scrollHeight;
                  }
                  if (usageTokens !== null) {
                    tokenUsageEl.textContent = String(usageTokens);
                  }
                } finally {
                  setSending(false);
                }
              });
            `
          }}
        />
      </body>
    </html>
  );
}

export function renderChatPage(models: ModelWithFree[]): string {
  const markup = renderToString(
    <React.Fragment>
      <ChatPage state={{ models }} />
    </React.Fragment>
  );
  return `<!doctype html>${markup}`;
}
