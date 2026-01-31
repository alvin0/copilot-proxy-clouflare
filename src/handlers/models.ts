import { getModelHeaders } from "../headers";
import { defaultModels } from "../models";
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

  let fetchedModels = defaultModels;
  const authHeader = request.headers.get("Authorization");
  if (authHeader) {
    const token = await getTokenFromRequest(request, longTermToken, kv);
    if (token) {
      const headersObj = getModelHeaders(token);
      const apiUrl = "https://api.individual.githubcopilot.com/models";
      const init = { method: "GET", headers: headersObj };
      const apiResp = await fetch(apiUrl, init);
      if (apiResp.ok) {
        const json = await apiResp.json() as { data?: typeof defaultModels };
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
