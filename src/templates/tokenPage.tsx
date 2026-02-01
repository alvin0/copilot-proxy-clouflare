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
            <div className="mb-6">
              <h1 className="text-2xl font-semibold tracking-tight">Set Long-Term Token</h1>
              <p className="mt-2 text-sm text-slate-300">
                Enter a GitHub long-term token (ghu/gho). The value is stored in KV and will overwrite any previous value.
              </p>
            </div>
            <StatusBanner status={state.status} />
            <TokenForm />
            <p className="mt-6 text-xs text-slate-400">For security, this page never displays the stored token.</p>
            <UsageSection usage={state.usage} usageError={state.usageError} hasToken={state.hasToken} />
            <ModelsSection models={state.models} modelsError={state.modelsError} hasToken={state.hasToken} />
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
