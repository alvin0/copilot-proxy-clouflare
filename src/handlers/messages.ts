import { copilotBaseUrl, copilotHeaders, resolveCopilotAccountType } from "../configs/api-config";
import { corsHeaders } from "../response";
import { getTokenFromRequest } from "../token";
import { state as baseState } from "../types/state";
import type { KvNamespaceLike } from "../kv/kv-types";

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isReasoningModel(model: string): boolean {
  return model.startsWith("o1") || model.startsWith("o3");
}

function sendAnthropicError(message: string, status: number): Response {
  return new Response(JSON.stringify({
    type: "error",
    error: { type: "invalid_request_error", message }
  }), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" }
  });
}

function joinSystem(system: unknown): string | null {
  if (typeof system === "string") return system;
  if (!Array.isArray(system)) return null;
  const parts: string[] = [];
  for (const block of system) {
    if (!isJsonObject(block)) continue;
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.length ? parts.join("\n") : null;
}

function mapAnthropicContentToResponsesContent(content: unknown): unknown {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const mapped: unknown[] = [];
  for (const block of content) {
    if (!isJsonObject(block)) continue;
    if (block.type === "text" && typeof block.text === "string") {
      mapped.push({ type: "input_text", text: block.text });
      continue;
    }
    if (block.type === "image") {
      const source = isJsonObject(block.source) ? block.source : null;
      const sourceType = source ? source.type : null;
      const mediaType = source ? source.media_type : null;
      const data = source ? source.data : null;
      const url = source ? source.url : null;
      if (sourceType === "base64" && typeof mediaType === "string" && typeof data === "string") {
        mapped.push({ type: "input_image", image_url: `data:${mediaType};base64,${data}` });
      } else if (sourceType === "url" && typeof url === "string" && url) {
        mapped.push({ type: "input_image", image_url: url });
      }
      continue;
    }
    // Ignore tool_use/tool_result/etc for now (can be added later).
  }
  return mapped;
}

function mapAnthropicMessagesToResponsesInput(messages: unknown): unknown[] {
  if (!Array.isArray(messages)) return [];
  const input: unknown[] = [];
  for (const msg of messages) {
    if (!isJsonObject(msg)) continue;
    const role = typeof msg.role === "string" ? msg.role : "user";
    const content = mapAnthropicContentToResponsesContent(msg.content);
    input.push({ role, content });
  }
  return input;
}

function extractOutputTextFromResponses(responseJson: JsonObject): string {
  const output = Array.isArray(responseJson.output) ? responseJson.output : [];
  const parts: string[] = [];
  for (const item of output) {
    if (!isJsonObject(item)) continue;
    if (item.type !== "message") continue;
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (!isJsonObject(part)) continue;
      if (part.type === "output_text" && typeof part.text === "string") {
        parts.push(part.text);
      }
    }
  }
  return parts.join("");
}

function extractUsageFromResponses(responseJson: JsonObject): { input_tokens?: number; output_tokens?: number } {
  const usage = isJsonObject(responseJson.usage) ? responseJson.usage : null;
  if (!usage) return {};
  const inputTokens = typeof usage.input_tokens === "number" ? usage.input_tokens : undefined;
  const outputTokens = typeof usage.output_tokens === "number" ? usage.output_tokens : undefined;
  return { input_tokens: inputTokens, output_tokens: outputTokens };
}

function anthropicSseEvent(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function handleMessages(
  request: Request,
  longTermToken?: string,
  kv?: KvNamespaceLike,
  username?: string,
  password?: string
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method === "GET") {
    const html = `<html><head><title>Welcome to API</title></head><body>
      <h1>Welcome to API</h1>
      <p>This endpoint emulates Anthropic Messages API on top of GitHub Copilot.</p>
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
    token = await getTokenFromRequest(request, longTermToken, kv, username, password);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return sendAnthropicError("Token processing failed: " + message, 500);
  }
  if (!token) return sendAnthropicError("Token is invalid.", 401);

  const anthropicReq = (await request.json()) as JsonObject;
  const model = typeof anthropicReq.model === "string" && anthropicReq.model ? anthropicReq.model : "gpt-4o";
  const requestedStream = anthropicReq.stream === true;

  const maxTokens = anthropicReq.max_tokens;
  if (typeof maxTokens !== "number" || !Number.isFinite(maxTokens) || maxTokens <= 0) {
    return sendAnthropicError("Anthropic /v1/messages requires `max_tokens` (number > 0).", 400);
  }

  const input = mapAnthropicMessagesToResponsesInput(anthropicReq.messages);
  if (input.length === 0) {
    return sendAnthropicError("Anthropic /v1/messages requires non-empty `messages`.", 400);
  }

  const instructions = joinSystem(anthropicReq.system);

  const responsesReq: JsonObject = {
    model,
    input,
    instructions,
    max_output_tokens: maxTokens,
    temperature: anthropicReq.temperature,
    top_p: anthropicReq.top_p,
    stream: requestedStream,
    stop: anthropicReq.stop_sequences
  };

  // Align with upstream limitations used elsewhere in this repo.
  if (isReasoningModel(model)) {
    responsesReq.stream = false;
  }

  const requestState = {
    ...baseState,
    accountType: resolveCopilotAccountType(request, baseState.accountType),
    copilotToken: token,
    vsCodeVersion: baseState.vsCodeVersion || "1.98.0-insider"
  };
  const headersObj = copilotHeaders(requestState, true);
  const apiUrl = `${copilotBaseUrl(requestState)}/responses`;
  const init: RequestInit = {
    method: "POST",
    headers: headersObj,
    body: JSON.stringify(responsesReq)
  };

  const upstream = await fetch(apiUrl, init);
  if (!upstream.ok) {
    const errText = await upstream.text();
    return sendAnthropicError(`API Error: ${upstream.status} - ${errText}`, upstream.status);
  }

  // Streaming: translate OpenAI Responses SSE -> Anthropic Messages SSE.
  if (requestedStream && responsesReq.stream === true) {
    if (!upstream.body) return sendAnthropicError("API Error: empty response body", 502);

    const { readable, writable } = new TransformStream();
    (async () => {
      const writer = writable.getWriter();
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      const messageId = "msg_" + crypto.randomUUID();
      const assistantModel = model;
      let started = false;
      let sentContentStart = false;
      let accumulated = "";
      let finalUsage: { input_tokens?: number; output_tokens?: number } = {};
      let currentEventName: string | null = null;
      let currentDataLines: string[] = [];
      let completed = false;

      const sendStartIfNeeded = async () => {
        if (started) return;
        started = true;
        await writer.write(anthropicSseEvent("message_start", {
          type: "message_start",
          message: {
            id: messageId,
            type: "message",
            role: "assistant",
            model: assistantModel,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 }
          }
        }));
      };

      const sendContentStartIfNeeded = async () => {
        if (sentContentStart) return;
        sentContentStart = true;
        await writer.write(anthropicSseEvent("content_block_start", {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" }
        }));
      };

      const finish = async (stopReason: string | null) => {
        await sendStartIfNeeded();
        await sendContentStartIfNeeded();
        await writer.write(anthropicSseEvent("content_block_stop", {
          type: "content_block_stop",
          index: 0
        }));
        await writer.write(anthropicSseEvent("message_delta", {
          type: "message_delta",
          delta: { stop_reason: stopReason ?? "end_turn", stop_sequence: null },
          usage: {
            output_tokens: finalUsage.output_tokens ?? 0
          }
        }));
        await writer.write(anthropicSseEvent("message_stop", { type: "message_stop" }));
      };

      const flushSseEvent = async (): Promise<boolean> => {
        if (!currentEventName && currentDataLines.length === 0) return false;
        const dataStr = currentDataLines.join("\n").trim();
        const eventName = currentEventName;
        currentEventName = null;
        currentDataLines = [];
        if (!dataStr) return false;
        if (dataStr === "[DONE]") {
          await finish("end_turn");
          completed = true;
          return true;
        }

        let eventJson: JsonObject | null = null;
        try {
          eventJson = JSON.parse(dataStr) as JsonObject;
        } catch {
          return false;
        }
        if (!eventJson) return false;
        if (typeof eventJson.type !== "string" && eventName) {
          eventJson.type = eventName;
        }

        const type = typeof eventJson.type === "string" ? eventJson.type : eventName;
        if (type === "ping") {
          await writer.write(anthropicSseEvent("ping", { type: "ping" }));
          return false;
        }

        if (type === "response.output_text.delta") {
          const delta = eventJson.delta;
          if (typeof delta === "string" && delta) {
            accumulated += delta;
            await sendContentStartIfNeeded();
            await writer.write(anthropicSseEvent("content_block_delta", {
              type: "content_block_delta",
              index: 0,
              delta: { type: "text_delta", text: delta }
            }));
          }
          return false;
        }

        if (type === "response.completed") {
          const response = isJsonObject(eventJson.response) ? eventJson.response : null;
          if (response) {
            finalUsage = extractUsageFromResponses(response);
            if (!accumulated) {
              accumulated = extractOutputTextFromResponses(response);
              if (accumulated) {
                await sendContentStartIfNeeded();
                await writer.write(anthropicSseEvent("content_block_delta", {
                  type: "content_block_delta",
                  index: 0,
                  delta: { type: "text_delta", text: accumulated }
                }));
              }
            }
          }
          await finish("end_turn");
          completed = true;
          return true;
        }

        if (type === "error") {
          const error = isJsonObject(eventJson.error) ? eventJson.error : null;
          const message = error && typeof error.message === "string" ? error.message : "Upstream error";
          await writer.write(anthropicSseEvent("error", {
            type: "error",
            error: { type: "api_error", message }
          }));
          completed = true;
          return true;
        }
        return false;
      };

      try {
        await sendStartIfNeeded();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line === "") {
              const done = await flushSseEvent();
              if (done) return;
              continue;
            }
            if (line.startsWith("event: ")) {
              currentEventName = line.substring(7).trim();
              continue;
            }
            if (line.startsWith("data: ")) {
              currentDataLines.push(line.substring(6));
              continue;
            }
          }
        }

        // Upstream ended without an explicit completion event.
        if (!completed) {
          await finish("end_turn");
        }
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      status: 200,
      headers: {
        ...corsHeaders(),
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  }

  // Non-stream: translate OpenAI Responses JSON -> Anthropic Messages JSON.
  const upstreamBody = await upstream.text();
  let responsesJson: JsonObject;
  try {
    responsesJson = JSON.parse(upstreamBody) as JsonObject;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return sendAnthropicError("Unable to parse upstream /responses JSON: " + message, 502);
  }

  const assistantText = extractOutputTextFromResponses(responsesJson);
  const usage = extractUsageFromResponses(responsesJson);

  const anthropicResp = {
    id: "msg_" + crypto.randomUUID(),
    type: "message",
    role: "assistant",
    model: typeof responsesJson.model === "string" ? responsesJson.model : model,
    content: [{ type: "text", text: assistantText }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0
    }
  };

  return new Response(JSON.stringify(anthropicResp), {
    status: 200,
    headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" }
  });
}
