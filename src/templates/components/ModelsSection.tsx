import React from "react";
import { Model } from "../../types/get-models";

type ModelsSectionProps = {
  models?: {
    items: Model[];
    fetchedAt: string;
  };
  modelsError?: string;
  hasToken?: boolean;
};

export function ModelsSection({ models, modelsError, hasToken }: ModelsSectionProps) {
  if (models) {
    return (
      <React.Fragment>
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Available Models</h2>
            <span className="text-xs text-slate-400">Updated {models.fetchedAt}</span>
          </div>
          <div className="mt-4 max-h-[420px] overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              {models.items.map(model => {
                const contextWindow = model.capabilities?.limits?.max_context_window_tokens;
                const contextLabel = contextWindow ? `${contextWindow.toLocaleString()} ctx` : "Context N/A";
                const vision = model.capabilities?.limits?.vision;
                const mediaLabels = [];
                if (vision && (vision.max_prompt_images || vision.max_prompt_image_size)) {
                  mediaLabels.push("Images");
                }
                const mediaLabel = mediaLabels.length > 0 ? mediaLabels.join(", ") : "None";
                return (
                  <div key={model.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-100">{model.name}</div>
                      <span className="text-xs text-slate-400">{model.vendor}</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-400">{model.id}</div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                      <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-200">
                        {model.capabilities.family}
                      </span>
                      <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-200">
                        {model.capabilities.type}
                      </span>
                      <span className="rounded-full bg-cyan-500/20 px-2 py-1 text-cyan-200">
                        {contextLabel}
                      </span>
                      <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-200">
                        Media: {mediaLabel}
                      </span>
                      {model.preview ? (
                        <span className="rounded-full bg-amber-500/20 px-2 py-1 text-amber-200">Preview</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">Showing {models.items.length} models.</p>
        </section>
      </React.Fragment>
    );
  }

  if (modelsError) {
    return (
      <React.Fragment>
        <div className="mt-6 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Failed to load models: {modelsError}
        </div>
      </React.Fragment>
    );
  }

  if (hasToken) {
    return (
      <React.Fragment>
        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
          Models will appear here once available.
        </div>
      </React.Fragment>
    );
  }

  return null;
}
