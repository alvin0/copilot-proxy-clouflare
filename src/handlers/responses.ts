import { copilotBaseUrl, copilotHeaders } from "../configs/api-config";
import { corsHeaders, sendError } from "../response";
import { getTokenFromRequest } from "../token";
import { state as baseState } from "../types/state";

type JsonObject = Record<string, unknown>;

function isReasoningModel(model: string): boolean {
  return model.startsWith("o1") || model.startsWith("o3");
}

function contentTypeOrFallback(resp: Response, fallback: string): string {
  return resp.headers.get("content-type") || fallback;
}

export async function handleResponses(
  request: Request,
  longTermToken?: string,
  kv?: KVNamespace
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method === "GET") {
    const html = `<html><head><title>Welcome to API</title></head><body>
      <h1>Welcome to API</h1>
      <p>This API exposes an OpenAI-compatible Responses endpoint backed by GitHub Copilot.</p>
      </body></html>`;
    return new Response(html, {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "text/html; charset=utf-8" }
    });
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

  const reqJson = (await request.json()) as JsonObject;
  const model = typeof reqJson.model === "string" && reqJson.model ? reqJson.model : "gpt-4o";
  const requestedStream = reqJson.stream === true;

  // Align with upstream limitations used elsewhere in this repo.
  if (isReasoningModel(model)) {
    reqJson.stream = false;
  } else {
    reqJson.stream = requestedStream;
  }

  const requestState = {
    ...baseState,
    copilotToken: token,
    vsCodeVersion: baseState.vsCodeVersion || "1.98.0-insider"
  };
  const headersObj = copilotHeaders(requestState, true);
  const apiUrl = `${copilotBaseUrl(requestState)}/responses`;
  const init: RequestInit = {
    method: "POST",
    headers: headersObj,
    body: JSON.stringify(reqJson)
  };

  const apiResp = await fetch(apiUrl, init);
  if (!apiResp.ok) {
    const errText = await apiResp.text();
    return sendError(`API Error: ${apiResp.status} - ${errText}`, apiResp.status);
  }

  if (requestedStream && reqJson.stream === true) {
    if (!apiResp.body) return sendError("API Error: empty response body", 502);
    return new Response(apiResp.body, {
      status: 200,
      headers: {
        ...corsHeaders(),
        "Content-Type": contentTypeOrFallback(apiResp, "text/event-stream; charset=utf-8"),
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  }

  const responseBody = await apiResp.text();
  return new Response(responseBody, {
    status: 200,
    headers: {
      ...corsHeaders(),
      "Content-Type": contentTypeOrFallback(apiResp, "application/json; charset=utf-8")
    }
  });
}

