import { copilotBaseUrl, copilotHeaders } from "../configs/api-config";
import { corsHeaders, sendError } from "../response";
import { getTokenFromRequest } from "../token";
import { state as baseState } from "../types/state";

export async function handleEmbeddings(
  request: Request,
  longTermToken?: string,
  kv?: KVNamespace
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

  const reqJson = await request.json();
  console.log("Received Embedding Request JSON:");
  console.log(JSON.stringify(reqJson, null, 4));

  const requestState = {
    ...baseState,
    copilotToken: token,
    vsCodeVersion: baseState.vsCodeVersion || "1.109.0-insider"
  };
  const headersObj = copilotHeaders(requestState, true);
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
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" }
    });
  }

  return sendError(`Failed to get embeddings from Copilot API: ${responseBody}`, apiResp.status);
}
