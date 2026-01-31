import { copilotBaseUrl, copilotHeaders } from "../configs/api-config";
import { corsHeaders, sendError } from "../response";
import { getTokenFromRequest } from "../token";
import { state as baseState } from "../types/state";

export async function handleChatCompletions(
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
      <p>This API is used to interact with the GitHub Copilot model. You can send messages to the model and receive responses.</p>
      </body></html>`;
    return new Response(html, { status: 200, headers: { ...corsHeaders(), "Content-Type": "text/html; charset=utf-8" } });
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

  const reqJson = await request.json() as Record<string, unknown>;
  const isStream = Boolean(reqJson.stream);
  const model = (reqJson.model as string | undefined) || "gpt-4o";

  if (model.startsWith("o1") || model.startsWith("o3")) {
    reqJson.stream = false;
  } else {
    reqJson.stream = isStream;
  }

  const requestState = {
    ...baseState,
    copilotToken: token,
    vsCodeVersion: baseState.vsCodeVersion || "1.98.0-insider"
  };
  const headersObj = copilotHeaders(requestState, true);
  const apiUrl = `${copilotBaseUrl(requestState)}/chat/completions`;
  const init = {
    method: "POST",
    headers: headersObj,
    body: JSON.stringify(reqJson)
  };

  if (model.startsWith("o1") || model.startsWith("o3")) {
    const apiResp = await fetch(apiUrl, init);
    if (!apiResp.ok) {
      const errText = await apiResp.text();
      return sendError(`API Error: ${apiResp.status} - ${errText}`, apiResp.status);
    }
    const responseBody = await apiResp.text();
    let responseJson;
    try {
      responseJson = JSON.parse(responseBody);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return sendError("Unable to parse API response JSON: " + message, 500);
    }

    let assistantContent = "";
    if (responseJson.choices && responseJson.choices.length > 0) {
      const firstChoice = responseJson.choices[0];
      if (firstChoice.message && firstChoice.message.content) {
        assistantContent = firstChoice.message.content;
      }
    }

    const openAIResponse = {
      id: "chatcmpl-" + crypto.randomUUID(),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: responseJson.model || model,
      system_fingerprint: responseJson.system_fingerprint || ("fp_" + crypto.randomUUID().replace(/-/g, "").substring(0, 12)),
      choices: [{
        index: 0,
        message: { role: "assistant", content: assistantContent },
        finish_reason: "stop"
      }]
    };

    const sseLine = "data: " + JSON.stringify(openAIResponse) + "\n\n";
    return new Response(sseLine, {
      headers: {
        ...corsHeaders(),
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  }

  if (isStream && reqJson.stream) {
    const apiResp = await fetch(apiUrl, init);
    if (!apiResp.ok) {
      const errText = await apiResp.text();
      return sendError(`API Error: ${apiResp.status} - ${errText}`, apiResp.status);
    }

    if (!apiResp.body) {
      return sendError("API Error: empty response body", 502);
    }

    const body = apiResp.body;
    const { readable, writable } = new TransformStream();
    (async () => {
      const writer = writable.getWriter();
      const reader = body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) {
            continue;
          }
          if (line.startsWith("data: ")) {
            const data = line.substring(6).trim();
            if (data === "[DONE]") {
              writer.write(new TextEncoder().encode(line + "\n"));
              await writer.close();
              return;
            }
            try {
              const sseJson = JSON.parse(data);
              if (sseJson.choices) {
                for (let i = 0; i < sseJson.choices.length; i++) {
                  const choice = sseJson.choices[i];
                  const delta = choice.delta;
                  if (delta && delta.content) {
                    const content = delta.content;
                    if (content) {
                      const newSseJson = {
                        choices: [{
                          index: choice.index || i,
                          delta: { content }
                        }],
                        created: sseJson.created || Math.floor(Date.now() / 1000),
                        id: sseJson.id || crypto.randomUUID(),
                        model: sseJson.model || (reqJson.model as string | undefined) || "gpt-4o",
                        system_fingerprint: sseJson.system_fingerprint || ("fp_" + crypto.randomUUID().replace(/-/g, "").substring(0, 12))
                      };
                      const newLine = "data: " + JSON.stringify(newSseJson) + "\n\n";
                      writer.write(new TextEncoder().encode(newLine));
                    }
                  }
                }
              }
            } catch (e) {
              const message = e instanceof Error ? e.message : String(e);
              console.error("JSON parsing error: " + message);
            }
          }
        }
      }
      await writer.close();
    })();

    return new Response(readable, {
      headers: {
        ...corsHeaders(),
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  }

  const apiResp = await fetch(apiUrl, init);
  if (!apiResp.ok) {
    const errText = await apiResp.text();
    return sendError(`API Error: ${apiResp.status} - ${errText}`, apiResp.status);
  }
  const responseBody = await apiResp.text();
  return new Response(responseBody, {
    status: 200,
    headers: { ...corsHeaders(), "Content-Type": "application/json" }
  });
}
