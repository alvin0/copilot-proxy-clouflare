import React from "react";
import { renderToString } from "react-dom/server";
import { Model } from "../types/get-models";
import { QuotaDetail } from "../types/get-usage";
import { ModelsSection } from "./components/ModelsSection";
import { StatusBanner } from "./components/StatusBanner";
import { TokenForm } from "./components/TokenForm";
import { UsageSection } from "./components/UsageSection";
import { tokenPageScript } from "./tokenPageScript";

type TokenPageState = {
  status?: "saved" | "invalid" | "kv-missing" | "invalid-username" | "invalid-password" | "auth-failed";
  hasToken?: boolean;
  username?: string;
  password?: string;
  usageDebug?: unknown;
  usage?: {
    chat: QuotaDetail;
    completions: QuotaDetail;
    premium_interactions: QuotaDetail;
    quota_reset_date: string;
    copilot_plan: string;
  };
  models?: {
    items: Model[];
    fetchedAt: string;
  };
  usageError?: string;
  modelsError?: string;
};

function TokenPage({ state }: { state: TokenPageState }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Set Long-Term Token</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6">
          <div className="w-full rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Set Long-Term Token</h1>
                {/* <p className="mt-2 text-sm text-slate-300">
                  Create a username + password pair and store its GitHub long-term token (ghu/gho) in KV.
                </p> */}
              </div>
              <a
                href={state.username && state.password
                  ? `/chat?username=${encodeURIComponent(state.username)}&password=${encodeURIComponent(state.password)}`
                  : "/chat"}
                className="inline-flex items-center gap-2 self-start rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-300 transition hover:border-slate-600 hover:text-slate-100 sm:self-auto"
              >
                <span>Go to Chat</span>
                <span aria-hidden="true">→</span>
              </a>
            </div>
            <StatusBanner status={state.status} />
            <TokenForm hasToken={state.hasToken} username={state.username} />
            <p className="mt-6 text-xs text-slate-400">
              Keep the generated password safe. It is required as `Authorization: Bearer &lt;password&gt;` for all API calls.
            </p>
            {state.status === "saved" && state.username && state.password ? (
              <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-200">
                <div className="text-xs uppercase tracking-wide text-slate-400">Saved credentials</div>
                <div className="mt-2 space-y-1 font-mono text-xs text-slate-100">
                  <div>Username: {state.username}</div>
                  <div>Password: {state.password}</div>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Copy these now — they are required to call the API.
                </p>
              </div>
            ) : null}

            <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-sm font-semibold text-slate-100">Load Usage / Models</div>
              <p className="mt-1 text-xs text-slate-400">Enter your username and password to view quota and models.</p>
              <form method="get" action="/" className="mt-4 grid gap-3 sm:grid-cols-2">
                <input
                  name="username"
                  type="text"
                  autoComplete="off"
                  defaultValue={state.username || ""}
                  placeholder="username"
                  className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
                />
                <input
                  name="password"
                  type="text"
                  autoComplete="off"
                  defaultValue={state.password || ""}
                  placeholder="acpc-XXXXXXXXXX"
                  className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
                />
                <button
                  type="submit"
                  className="sm:col-span-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-white"
                >
                  Load Usage & Models
                </button>
              </form>
            </div>
            {(state.password && state.username) ? (
              <React.Fragment>
                <UsageSection usage={state.usage} usageError={state.usageError} hasToken={state.hasToken} />
                {state.usageDebug ? (
                  <details className="mt-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-300">
                    <summary className="cursor-pointer text-xs text-slate-400">Debug: raw usage response</summary>
                    <pre className="mt-3 whitespace-pre-wrap text-[11px] text-slate-200">
                      {JSON.stringify(state.usageDebug, null, 2)}
                    </pre>
                  </details>
                ) : null}
                <ModelsSection models={state.models} modelsError={state.modelsError} hasToken={state.hasToken} />
              </React.Fragment>
            ) : (
              <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
                Please log in to view usage and models.
              </div>
            )}
          </div>
        </div>
        <script dangerouslySetInnerHTML={{ __html: tokenPageScript }} />
      </body>
    </html>
  );
}

export function renderTokenPage(state: TokenPageState = {}): string {
  const markup = renderToString(
    <React.Fragment>
      <TokenPage state={state} />
    </React.Fragment>
  );
  return `<!doctype html>${markup}`;
}
