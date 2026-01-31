import { copilotBaseUrl, copilotHeaders } from "../configs/api-config";
import { ModelsResponse } from "../configs/get-models";
import { state as baseState } from "../configs/state";
import { corsHeaders } from "../response";
import { getTokenFromRequest } from "../token";

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

  let fetchedModels = [] as Array<any>;
  const authHeader = request.headers.get("Authorization");
  if (authHeader) {
    const token = await getTokenFromRequest(request, longTermToken, kv);
    if (token) {
      const requestState = {
        ...baseState,
        copilotToken: token,
        vsCodeVersion: baseState.vsCodeVersion || "1.98.0-insider"
      };
      const headersObj = copilotHeaders(requestState);
      const apiUrl = `${copilotBaseUrl(requestState)}/models`;
      const init = { method: "GET", headers: headersObj };
      const apiResp = await fetch(apiUrl, init);
      if (apiResp.ok) {
        const json = await apiResp.json() as ModelsResponse;
        fetchedModels = json.data || fetchedModels;
      }
    }
  }

  const responseJson = { data: fetchedModels, object: "list" };
  return new Response(JSON.stringify(responseJson), {
    status: 200,
    headers: { ...corsHeaders(), "Content-Type": "application/json" }
  });
}
