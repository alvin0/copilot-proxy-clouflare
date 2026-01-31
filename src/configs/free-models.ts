import { Model } from "../types/get-models";

export type ModelWithFree = Model & { free: boolean };

export const FREE_ID_MODELS = [
  "gpt-5-mini",
  "gpt-4o-2024-11-20",
  "grok-code-fast-1",
  "oswe-vscode-prime"
];

const FREE_ID_MODEL_SET = new Set(FREE_ID_MODELS);
const FREE_ID_MODEL_PRIORITY = new Map(
  FREE_ID_MODELS.map((id, index) => [id, index])
);

export function withFreeFlag(models: Model[]): ModelWithFree[] {
  const enriched = models.map((model, index) => ({
    ...model,
    free: FREE_ID_MODEL_SET.has(model.id),
    _index: index,
    _priority: FREE_ID_MODEL_PRIORITY.get(model.id)
  }));

  enriched.sort((a, b) => {
    const aPriority = a._priority;
    const bPriority = b._priority;
    if (aPriority !== undefined && bPriority !== undefined) {
      return aPriority - bPriority;
    }
    if (aPriority !== undefined) return -1;
    if (bPriority !== undefined) return 1;
    return a._index - b._index;
  });

  return enriched.map(({ _index, _priority, ...model }) => model);
}
