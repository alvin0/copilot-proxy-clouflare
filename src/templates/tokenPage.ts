import { Model } from "../types/get-models";
import { QuotaDetail } from "../types/get-usage";

type TokenPageState = {
  status?: "saved" | "invalid" | "kv-missing";
  hasToken?: boolean;
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

function renderQuotaCard(title: string, detail: QuotaDetail): string {
  const remaining = detail.unlimited ? "Unlimited" : detail.remaining.toLocaleString();
  const percent = detail.unlimited ? 100 : Math.max(0, Math.min(100, detail.percent_remaining));
  return `<div class="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-slate-200">${title}</h3>
      <span class="text-xs text-slate-400">Quota</span>
    </div>
    <div class="mt-3 text-2xl font-semibold text-slate-100">${remaining}</div>
    <div class="mt-2 h-2 w-full rounded-full bg-slate-800">
      <div class="h-2 rounded-full bg-cyan-400" style="width:${percent}%"></div>
    </div>
    <div class="mt-2 text-xs text-slate-400">${percent}% remaining</div>
  </div>`;
}

export function renderTokenPage(state: TokenPageState = {}): string {
  const banner =
    state.status === "saved"
      ? `<div class="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Token saved to KV successfully.
        </div>`
      : state.status === "invalid"
      ? `<div class="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Invalid token format. Please enter a ghu/gho token.
        </div>`
      : state.status === "kv-missing"
      ? `<div class="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          KV binding is missing. Configure TOKEN_KV first.
        </div>`
      : "";

  const usageSection = state.usage
    ? `<section class="mt-8">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-slate-100">Usage Dashboard</h2>
          <span class="text-xs text-slate-400">Plan: ${state.usage.copilot_plan}</span>
        </div>
        <p class="mt-1 text-xs text-slate-400">Quota resets on ${state.usage.quota_reset_date}</p>
        <div class="mt-4 grid gap-4 md:grid-cols-3">
          ${renderQuotaCard("Chat", state.usage.chat)}
          ${renderQuotaCard("Completions", state.usage.completions)}
          ${renderQuotaCard("Premium Interactions", state.usage.premium_interactions)}
        </div>
      </section>`
    : state.usageError
    ? `<div class="mt-6 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
        Failed to load usage: ${state.usageError}
      </div>`
    : state.hasToken
    ? `<div class="mt-6 rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
        Token is stored. Usage data will appear here once available.
      </div>`
    : `<div class="mt-6 rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
        No token stored yet. Save a token to load usage data.
      </div>`;

  const modelsSection = state.models
    ? `<section class="mt-8">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-slate-100">Available Models</h2>
          <span class="text-xs text-slate-400">Updated ${state.models.fetchedAt}</span>
        </div>
        <div class="mt-4 grid gap-3 md:grid-cols-2">
          ${state.models.items.slice(0, 8).map(model => `
            <div class="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div class="flex items-center justify-between">
                <div class="text-sm font-semibold text-slate-100">${model.name}</div>
                <span class="text-xs text-slate-400">${model.vendor}</span>
              </div>
              <div class="mt-2 text-xs text-slate-400">${model.id}</div>
              <div class="mt-3 flex gap-2 text-[11px]">
                <span class="rounded-full bg-slate-800 px-2 py-1 text-slate-200">${model.capabilities.family}</span>
                <span class="rounded-full bg-slate-800 px-2 py-1 text-slate-200">${model.capabilities.type}</span>
                ${model.preview ? `<span class="rounded-full bg-amber-500/20 px-2 py-1 text-amber-200">Preview</span>` : ""}
              </div>
            </div>
          `).join("")}
        </div>
        <p class="mt-3 text-xs text-slate-400">Showing ${Math.min(8, state.models.items.length)} of ${state.models.items.length} models.</p>
      </section>`
    : state.modelsError
    ? `<div class="mt-6 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
        Failed to load models: ${state.modelsError}
      </div>`
    : state.hasToken
    ? `<div class="mt-6 rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
        Models will appear here once available.
      </div>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Set Long-Term Token</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="min-h-screen bg-slate-950 text-slate-100">
    <div class="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6">
      <div class="w-full rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl">
        <div class="mb-6">
          <h1 class="text-2xl font-semibold tracking-tight">Set Long-Term Token</h1>
          <p class="mt-2 text-sm text-slate-300">
            Enter a GitHub long-term token (ghu/gho). The value is stored in KV and will overwrite any previous value.
          </p>
        </div>
        ${banner}
        <form method="post" action="/" class="space-y-4">
          <div>
            <label for="token" class="block text-sm font-medium text-slate-200">Long-Term Token</label>
            <input
              id="token"
              name="token"
              type="password"
              autocomplete="off"
              required
              placeholder="ghu_... or gho_..."
              class="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
            />
          </div>
          <button
            type="submit"
            class="w-full rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
          >
            Save Token
          </button>
        </form>
        <p class="mt-6 text-xs text-slate-400">
          For security, this page never displays the stored token.
        </p>
        ${usageSection}
        ${modelsSection}
      </div>
    </div>
  </body>
</html>`;
}
