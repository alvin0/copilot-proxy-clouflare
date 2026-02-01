import React from "react";

type RegisteredKeysSectionProps = {
  users: string[];
  error?: string;
};

export function RegisteredKeysSection({ users, error }: RegisteredKeysSectionProps) {
  return (
    <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">Registered keys</div>
          <div className="mt-1 text-xs text-slate-400">
            Each key is a registered username. Deleting it removes the stored GitHub token and cached session tokens.
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {error}
        </div>
      ) : null}

      {users.length === 0 ? (
        <div className="mt-3 text-sm text-slate-300">No keys registered yet.</div>
      ) : (
        <div className="mt-4 max-h-[340px] space-y-3 overflow-y-auto pr-1">
          {users.map(username => (
            <div
              key={username}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3"
            >
              <div className="min-w-0 font-mono text-xs text-slate-200">{username}</div>
              <button
                type="button"
                data-delete-user="1"
                data-username={username}
                className="shrink-0 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/20"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      <dialog
        id="delete-user-modal"
        className="w-[min(92vw,520px)] rounded-2xl border border-slate-800 bg-slate-950 p-0 text-slate-100 shadow-2xl backdrop:bg-slate-950/70"
      >
        <div className="p-5">
          <div className="text-sm font-semibold text-slate-100">Delete key</div>
          <p className="mt-1 text-xs text-slate-400">
            This will delete <span id="delete-user-username" className="font-mono text-slate-200"></span> and its stored token.
          </p>

          <form method="post" action="/users/delete" className="mt-4 space-y-3">
            <input id="delete-user-username-input" type="hidden" name="username" value="" />
            <div>
              <label htmlFor="delete-user-password" className="block text-xs font-medium text-slate-200">
                Password
              </label>
              <input
                id="delete-user-password"
                name="password"
                type="text"
                autoComplete="off"
                required
                placeholder="acpc-XXXXXXXXXX"
                pattern="^acpc-[A-Za-z0-9]{10}$"
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400/30"
              />
              <p className="mt-1 text-[11px] text-slate-500">Enter the exact password for this username to confirm.</p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                id="delete-user-cancel"
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/20"
              >
                Delete
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </div>
  );
}
