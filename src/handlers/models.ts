import { copilotBaseUrl, copilotHeaders } from "../configs/api-config";
import { ModelWithFree, withFreeFlag } from "../configs/free-models";
import { corsHeaders } from "../response";
import { getTokenFromRequest } from "../token";
import { Model, ModelsResponse } from "../types/get-models";
import { state as baseState } from "../types/state";

const MODELS_CACHE_KEY = "modelsCache";
const defaultModels: Model[] = [];

type ModelsCache = {
  data: Model[];
  fetchedAt: string;
};

export async function fetchModels(token: string): Promise<Model[]> {
  const requestState = {
    ...baseState,
    copilotToken: token,
    vsCodeVersion: baseState.vsCodeVersion || "1.109.0-insider"
  };
  const headersObj = copilotHeaders(requestState);
  const apiUrl = `${copilotBaseUrl(requestState)}/models`;
  const init = { method: "GET", headers: headersObj };
  const apiResp = await fetch(apiUrl, init);
  if (!apiResp.ok) {
    return defaultModels;
  }
  const json = await apiResp.json() as ModelsResponse;
  return json.data || defaultModels;
}

export async function getModelsWithCache(
  token: string,
  kv?: KVNamespace
): Promise<ModelsCache> {
  if (kv) {
    const cached = await kv.get(MODELS_CACHE_KEY, "json");
    if (cached && typeof cached === "object" && "data" in cached && "fetchedAt" in cached) {
      return cached as ModelsCache;
    }
  }

  const data = await fetchModels(token);
  const cache: ModelsCache = { data, fetchedAt: new Date().toISOString() };
  if (kv) {
    await kv.put(MODELS_CACHE_KEY, JSON.stringify(cache));
  }
  return cache;
}

export async function handleModels(
  request: Request,
  longTermToken?: string,
  kv?: KVNamespace
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: corsHeaders() });
  }

  let fetchedModels = defaultModels;
  const token = await getTokenFromRequest(request, longTermToken, kv);
  if (token) {
    const cache = await getModelsWithCache(token, kv);
    fetchedModels = cache.data;
  }

  const modelsWithFree: ModelWithFree[] = withFreeFlag(fetchedModels);
  const responseJson = { data: modelsWithFree, object: "list" };
  return new Response(JSON.stringify(responseJson), {
    status: 200,
    headers: { ...corsHeaders(), "Content-Type": "application/json" }
  });
}
