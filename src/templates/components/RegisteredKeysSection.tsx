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
        <div className="mt-4 space-y-3">
          {users.map(username => (
            <div
              key={username}
              className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="font-mono text-xs text-slate-200">{username}</div>
              <form method="post" action="/users/delete" className="flex flex-1 flex-col gap-2 sm:flex-row sm:justify-end">
                <input type="hidden" name="username" value={username} />
                <input
                  name="password"
                  type="text"
                  autoComplete="off"
                  required
                  placeholder="acpc-XXXXXXXXXX"
                  pattern="^acpc-[A-Za-z0-9]{10}$"
                  className="w-full sm:w-64 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400/30"
                />
                <button
                  type="submit"
                  className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/20"
                >
                  Delete
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

