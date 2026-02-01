import React from "react";
import { QuotaDetail } from "../../types/get-usage";

type UsageSectionProps = {
  usage?: {
    chat: QuotaDetail;
    completions: QuotaDetail;
    premium_interactions: QuotaDetail;
    quota_reset_date: string;
    copilot_plan: string;
  };
  usageError?: string;
  hasToken?: boolean;
};

function QuotaCard({ title, detail }: { title: string; detail: QuotaDetail }) {
  const remaining = detail.unlimited ? "Unlimited" : detail.remaining.toLocaleString();
  const percent = detail.unlimited ? 100 : Math.max(0, Math.min(100, detail.percent_remaining));
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <span className="text-xs text-slate-400">Quota</span>
      </div>
      <div className="mt-3 text-2xl font-semibold text-slate-100">{remaining}</div>
      <div className="mt-2 h-2 w-full rounded-full bg-slate-800">
        <div className="h-2 rounded-full bg-cyan-400" style={{ width: `${percent}%` }}></div>
      </div>
      <div className="mt-2 text-xs text-slate-400">{percent}% remaining</div>
    </div>
  );
}

export function UsageSection({ usage, usageError, hasToken }: UsageSectionProps) {
  const hasUsageDetails = Boolean(
    usage &&
    usage.chat &&
    usage.completions &&
    usage.premium_interactions
  );

  if (hasUsageDetails && usage) {
    return (
      <React.Fragment>
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Usage Dashboard</h2>
            <span className="text-xs text-slate-400">Plan: {usage.copilot_plan}</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Quota resets on {usage.quota_reset_date}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <QuotaCard title="Chat" detail={usage.chat} />
            <QuotaCard title="Completions" detail={usage.completions} />
            <QuotaCard title="Premium Interactions" detail={usage.premium_interactions} />
          </div>
        </section>
      </React.Fragment>
    );
  }

  if (usageError || usage) {
    return (
      <React.Fragment>
        <div className="mt-6 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Failed to load usage: {usageError || "Missing quota details."}
        </div>
      </React.Fragment>
    );
  }

  if (hasToken) {
    return (
      <React.Fragment>
        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
          Token is stored. Usage data will appear here once available.
        </div>
      </React.Fragment>
    );
  }

  return (
    <React.Fragment>
      <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
        No token stored yet. Save a token to load usage data.
      </div>
    </React.Fragment>
  );
}
