import React from "react";
import { renderToString } from "react-dom/server";
import { ModelWithFree } from "../configs/free-models";

type ChatPageState = {
  models: ModelWithFree[];
};

function ChatPage({ state }: { state: ChatPageState }) {
  const modelOptions = state.models.length > 0
    ? state.models.map(model => (
      <option key={model.id} value={model.id}>
        {model.name} ({model.id}){model.free ? " - FREE" : ""}
      </option>
    ))
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

          <section className="flex-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div id="messages" className="space-y-4"></div>
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
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span className="hidden sm:inline">Tokens used: <span id="token-usage" className="text-slate-200">N/A</span></span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                  <input id="stream" type="checkbox" className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-950/60" />
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
            <p className="mt-3 text-xs text-slate-500">Messages are sent to /v1/chat/completions</p>
          </form>
        </div>

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
              const submitButton = form.querySelector('button[type="submit"]');

              const state = { messages: [], isSending: false };

              function createMessageElement(role, content) {
                const wrapper = document.createElement('div');
                wrapper.className = 'rounded-xl border border-slate-800 bg-slate-950/40 p-4';
                wrapper.setAttribute('data-role', role);
                const title = document.createElement('div');
                title.className = 'text-xs font-semibold uppercase tracking-wide text-slate-400';
                title.textContent = role;
                const body = document.createElement('div');
                body.className = 'mt-2 whitespace-pre-wrap text-sm text-slate-100';
                body.textContent = content;
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

              promptEl.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' || event.shiftKey) return;
                event.preventDefault();
                form.requestSubmit();
              });

              form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const prompt = promptEl.value.trim();
                if (state.isSending || !prompt) return;
                setSending(true);
                const model = modelEl.value;
                state.messages.push({ role: 'user', content: prompt });
                appendMessage('user', prompt);
                promptEl.value = '';

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
                    assistantBodyEl.textContent = assistantContent;
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
