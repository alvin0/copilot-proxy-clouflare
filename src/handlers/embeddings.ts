import { copilotBaseUrl, copilotHeaders, resolveCopilotAccountType } from "../configs/api-config";
import { corsHeaders, sendError } from "../response";
import { getTokenFromRequest } from "../token";
import { state as baseState } from "../types/state";
import type { KvNamespaceLike } from "../kv/kv-types";

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function handleEmbeddings(
  request: Request,
  longTermToken?: string,
  kv?: KvNamespaceLike
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: corsHeaders() });
  }

  let token: string | null;
  try {
    token = await getTokenFromRequest(request, longTermToken, kv);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return sendError("Token processing failed: " + message, 500);
  }
  if (!token) return sendError("Token is invalid.", 401);

  const rawReq = await request.json() as unknown;
  if (!isJsonObject(rawReq)) {
    return sendError("Embeddings request must be a JSON object.", 400);
  }

  const model = typeof rawReq.model === "string" ? rawReq.model.trim() : "";
  if (!model) {
    return sendError("Embeddings request requires `model` (string).", 400);
  }

  let normalizedModel = model;
  if (normalizedModel.startsWith("github_copilot/")) {
    normalizedModel = normalizedModel.replace("github_copilot/", "");
  }

  const input = rawReq.input;
  let normalizedInput: unknown;
  if (typeof input === "string") {
    normalizedInput = [input];
  } else if (Array.isArray(input)) {
    normalizedInput = input;
  } else {
    return sendError("Embeddings request requires `input` (string or array).", 400);
  }

  const reqJson: JsonObject = { ...rawReq, model: normalizedModel, input: normalizedInput };
  delete reqJson.stream;

  console.log("Received Embedding Request JSON:");
  console.log(JSON.stringify(reqJson, null, 4));

  const requestState = {
    ...baseState,
    accountType: resolveCopilotAccountType(request, baseState.accountType),
    copilotToken: token,
    vsCodeVersion: baseState.vsCodeVersion || "1.109.0-insider"
  };
  const headersObj = copilotHeaders(requestState);
  const apiUrl = `${copilotBaseUrl(requestState)}/embeddings`;
  const init = {
    method: "POST",
    headers: headersObj,
    body: JSON.stringify(reqJson)
  };

  const apiResp = await fetch(apiUrl, init);
  const responseBody = await apiResp.text();
  console.log("Embedding Response:");
  try {
    console.log(JSON.stringify(JSON.parse(responseBody), null, 4));
  } catch (e) {
    console.log(responseBody);
  }

  if (apiResp.ok) {
    return new Response(responseBody, {
      status: apiResp.status,
      headers: {
        ...corsHeaders(),
        "Content-Type": apiResp.headers.get("content-type") || "application/json; charset=utf-8"
      }
    });
  }

  return sendError(`Failed to get embeddings from Copilot API: ${responseBody}`, apiResp.status);
}
