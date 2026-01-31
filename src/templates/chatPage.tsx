import React from "react";
import { renderToString } from "react-dom/server";
import { ModelWithFree } from "../configs/free-models";
import { chatPageScript } from "./chatPageScript";

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
      <body className="h-screen overflow-hidden bg-slate-950 text-slate-100">
        <div className="mx-auto flex h-screen min-h-0 max-w-4xl flex-col gap-6 px-6 py-10">
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

        <script dangerouslySetInnerHTML={{ __html: chatPageScript }} />
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
