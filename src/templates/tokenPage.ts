type TokenPageState = {
  status?: "saved" | "invalid" | "kv-missing";
};

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
      </div>
    </div>
  </body>
</html>`;
}
