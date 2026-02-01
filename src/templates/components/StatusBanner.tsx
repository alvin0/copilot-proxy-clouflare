import React from "react";

type StatusBannerProps = {
  status?: "saved" | "invalid" | "kv-missing" | "invalid-username" | "invalid-password" | "auth-failed";
};

export function StatusBanner({ status }: StatusBannerProps) {
  if (status === "saved") {
    return (
      <React.Fragment>
        <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Token saved to KV successfully.
        </div>
      </React.Fragment>
    );
  }
  if (status === "invalid") {
    return (
      <React.Fragment>
        <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Invalid token format. Please enter a ghu/gho token.
        </div>
      </React.Fragment>
    );
  }
  if (status === "invalid-username") {
    return (
      <React.Fragment>
        <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Invalid username. Use lowercase letters, numbers, and hyphens only.
        </div>
      </React.Fragment>
    );
  }
  if (status === "invalid-password") {
    return (
      <React.Fragment>
        <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Invalid password format. Please regenerate a strong password.
        </div>
      </React.Fragment>
    );
  }
  if (status === "auth-failed") {
    return (
      <React.Fragment>
        <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Authentication failed. Please verify username and password.
        </div>
      </React.Fragment>
    );
  }
  if (status === "kv-missing") {
    return (
      <React.Fragment>
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          KV binding is missing. Configure TOKEN_KV first.
        </div>
      </React.Fragment>
    );
  }
  return null;
}
