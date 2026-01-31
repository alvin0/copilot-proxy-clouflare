import { Model } from "../types/get-models";

export type ModelWithFree = Model & { free: boolean };

export const FREE_MODELS = new Set<string>([
  "GPT-4.1",
  "GPT-4o",
  "GPT-5 mini",
  "Grok Code Fast 1",
  "Raptor mini (Preview)",
]);

export function withFreeFlag(models: Model[]): ModelWithFree[] {
  return models.map(model => ({
    ...model,
    free: FREE_MODELS.has(model.name) || FREE_MODELS.has(model.id),
  }));
}
