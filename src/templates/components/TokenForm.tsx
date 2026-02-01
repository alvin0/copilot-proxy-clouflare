import React from "react";

export function TokenForm() {
  return (
    <React.Fragment>
      <form id="token-form" method="post" action="/" className="space-y-4">
        <div>
          <label htmlFor="token" className="block text-sm font-medium text-slate-200">
            Long-Term Token
          </label>
          <input
            id="token"
            name="token"
            type="password"
            autoComplete="off"
            required
            placeholder="ghu_... or gho_..."
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
        >
          Save Token
        </button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-800" />
        <span className="text-xs text-slate-400">or</span>
        <div className="h-px flex-1 bg-slate-800" />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-100">Get token via GitHub</div>
            <div className="mt-1 text-xs text-slate-400">
              This will open GitHub device login, then auto-save the issued token to KV.
            </div>
          </div>
          <div className="flex gap-2">
            <button
              id="device-start"
              type="button"
              className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-white"
            >
              Start
            </button>
            <button
              id="device-cancel"
              type="button"
              disabled
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>

        <div id="device-panel" className="mt-4 hidden space-y-3">
          <div className="text-xs text-slate-300">
            Code:{" "}
            <span
              id="device-user-code"
              className="rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1 font-mono text-slate-100"
            ></span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <a
              id="device-open-link"
              href="https://github.com/login/device"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
            >
              Open GitHub Device Login
            </a>
            <a
              id="device-verification-link"
              href="https://github.com/login/device"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-cyan-300 hover:text-cyan-200"
            >
              github.com/login/device
            </a>
          </div>

          <div
            id="device-status"
            className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-300"
          ></div>
        </div>
      </div>
    </React.Fragment>
  );
}
