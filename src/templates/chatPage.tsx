import React from "react";
import { renderToString } from "react-dom/server";
import { ModelWithFree } from "../configs/free-models";
import { chatPageScript } from "./chatPageScript";

type ChatPageState = {
  models: ModelWithFree[];
  username?: string;
  password?: string;
};

function ChatPage({ state }: { state: ChatPageState }) {
  const selectableModels = state.models.filter(model => model.model_picker_enabled);
  const modelOptions = selectableModels.length > 0
    ? selectableModels.map(model => {
      const vision = model.capabilities?.limits?.vision;
      const supports = vision ? "Images" : "Text only";
      const supportDetails = [];
      if (vision?.max_prompt_images) {
        supportDetails.push(`max ${vision.max_prompt_images.toLocaleString()} images`);
      }
      if (vision?.max_prompt_image_size) {
        supportDetails.push(`max image size ${vision.max_prompt_image_size.toLocaleString()}`);
      }
      const contextWindow = model.capabilities?.limits?.max_context_window_tokens;
      const supportedMediaTypes = vision?.supported_media_types || [];
      const maxPromptImages = vision?.max_prompt_images;
      if (supportedMediaTypes.length > 0) {
        supportDetails.push(`types ${supportedMediaTypes.join(", ")}`);
      }
      const supportsDetailText = supportDetails.length > 0 ? supportDetails.join(", ") : "";
      return (
        <option
          key={model.id}
          value={model.id}
          data-supports={supports}
          data-supports-detail={supportsDetailText}
          data-media-types={supportedMediaTypes.join(",")}
          data-max-images={typeof maxPromptImages === "number" ? String(maxPromptImages) : ""}
          data-context-window={contextWindow ? String(contextWindow) : ""}
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
      <body
        className="h-screen overflow-hidden bg-slate-950 text-slate-100"
        data-username={state.username || ""}
        data-password={state.password || ""}
      >
        <div className="mx-auto flex h-screen min-h-0 max-w-4xl flex-col gap-6 px-6 py-10">
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
              <p className="mt-1 text-sm text-slate-400">Chat with the current Copilot models.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                id="toggle-auth"
                type="button"
                className="rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-300 transition hover:border-slate-600 hover:text-slate-100"
              >
                Auth
              </button>
              <button
                id="clear-chat"
                type="button"
                className="rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-300 transition hover:border-slate-600 hover:text-slate-100"
              >
                Clear
              </button>
              <a className="text-sm text-cyan-300 hover:text-cyan-200" href="/">Token Setup</a>
            </div>
          </header>

          <section id="auth-panel" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
              <input
                id="api-username"
                type="text"
                autoComplete="off"
                defaultValue={state.username || ""}
                placeholder="username"
                className="min-w-[160px] flex-1 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
              />
              <input
                id="api-password"
                type="text"
                autoComplete="off"
                defaultValue={state.password || ""}
                placeholder="acpc-XXXXXXXXXX"
                className="min-w-[220px] flex-1 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
              />
              <button
                id="auth-save"
                type="button"
                className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-950 hover:bg-white"
              >
                Save
              </button>
            </div>
          </section>

          <section className="flex max-h-[75vh] flex-1 flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div id="messages" className="flex-1 min-h-0 space-y-4 overflow-y-auto pr-2"></div>
            <div id="loading" className="mt-4 hidden items-center gap-2 text-xs text-slate-400">
              <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400"></span>
              <span>LLM is thinking...</span>
            </div>
          </section>

          <form id="chat-form" className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            <textarea
              id="prompt"
              className="h-16 w-full resize-none bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
              placeholder="Type your message..."
              required
            />
            <div id="attachments" className="mt-3 hidden flex-wrap gap-2"></div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span className="hidden sm:inline">Context window: <span id="context-window" className="text-slate-200">N/A</span></span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {/* <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs text-slate-200 hover:border-slate-500">
                  <input id="file-input" type="file" className="hidden" />
                  + File
                </label> */}
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
          </form>
        </div>

        <div
          id="toast"
          className="pointer-events-none fixed bottom-6 right-6 hidden max-w-sm rounded-xl border border-rose-500/40 bg-rose-500/20 px-4 py-3 text-xs text-rose-100 shadow-lg"
        ></div>

        <div
          id="clear-modal"
          className="fixed inset-0 z-50 hidden items-center justify-center bg-slate-950/70 px-6"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-100">Clear conversation?</h3>
            <p className="mt-2 text-xs text-slate-400">This will remove all messages in the chat window.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                id="cancel-clear"
                type="button"
                className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-slate-600 hover:text-slate-100"
              >
                Cancel
              </button>
              <button
                id="confirm-clear"
                type="button"
                className="rounded-full bg-rose-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-rose-400"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>

        <script dangerouslySetInnerHTML={{ __html: chatPageScript }} />
      </body>
    </html>
  );
}

export function renderChatPage(models: ModelWithFree[], username?: string, password?: string): string {
  const markup = renderToString(
    <React.Fragment>
      <ChatPage state={{ models, username, password }} />
    </React.Fragment>
  );
  return `<!doctype html>${markup}`;
}
