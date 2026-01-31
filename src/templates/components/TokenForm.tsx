import React from "react";

export function TokenForm() {
  return (
    <React.Fragment>
      <form method="post" action="/" className="space-y-4">
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
    </React.Fragment>
  );
}
