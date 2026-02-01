import { copilotBaseUrl, copilotHeaders } from "../configs/api-config";
import { corsHeaders, sendError } from "../response";
import { getTokenFromRequest } from "../token";
import { state as baseState } from "../types/state";

type JsonObject = Record<string, unknown>;

type ResponseStatus =
  | "completed"
  | "failed"
  | "in_progress"
  | "cancelled"
  | "queued"
  | "incomplete";

function coerceBoolean(value: unknown): boolean {
  return value === true;
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const part of content) {
    if (!isJsonObject(part)) continue;
    const type = part.type;
    if (type === "text" || type === "output_text" || type === "input_text") {
      const text = part.text;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.join("");
}

function getOptionalString(obj: JsonObject, key: string): string | null {
  const value = obj[key];
  return typeof value === "string" ? value : null;
}

function getOptionalNumber(obj: JsonObject, key: string): number | null {
  const value = obj[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getOptionalBoolean(obj: JsonObject, key: string): boolean | null {
  const value = obj[key];
  return typeof value === "boolean" ? value : null;
}

function getOptionalArray(obj: JsonObject, key: string): unknown[] | null {
  const value = obj[key];
  return Array.isArray(value) ? value : null;
}

function getOptionalObject(obj: JsonObject, key: string): JsonObject | null {
  const value = obj[key];
  return isJsonObject(value) ? value : null;
}

function buildChatMessagesFromResponsesInput(reqJson: JsonObject): unknown[] {
  const messages: unknown[] = [];

  const instructions = reqJson.instructions;
  if (typeof instructions === "string" && instructions.trim()) {
    // Responses API treats `instructions` as system/developer guidance.
    messages.push({ role: "developer", content: instructions });
  }

  const input = reqJson.input ?? reqJson.messages;
  if (typeof input === "string") {
    messages.push({ role: "user", content: input });
    return messages;
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === "string") {
        messages.push({ role: "user", content: item });
        continue;
      }
      if (!isJsonObject(item)) continue;

      // Support both {role, content} and {type:"message", role, content}.
      const role = typeof item.role === "string" ? item.role : "user";
      const type = item.type;
      const content = item.content;
      if (typeof content === "string" || Array.isArray(content)) {
        // Pass through strings; map Responses-style content parts to ChatCompletions-style parts.
        if (Array.isArray(content)) {
          const mapped = content.map(part => {
            if (!isJsonObject(part)) return part;
            if (part.type === "input_text") {
              return { type: "text", text: part.text };
            }
            if (part.type === "output_text") {
              return { type: "text", text: part.text };
            }
            return part;
          });
          messages.push({ role, content: mapped });
        } else {
          messages.push({ role, content });
        }
        continue;
      }

      // Best-effort: if the item looks like an input_text item, treat it as user text.
      if (type === "input_text" && typeof item.text === "string") {
        messages.push({ role: "user", content: item.text });
        continue;
      }

      // Some clients send {input_text: "..."}-like shapes; best-effort fallback.
      if (typeof item.input_text === "string") {
        messages.push({ role, content: item.input_text });
      }
    }
  }

  return messages;
}

function buildOutputMessageItem(params: {
  itemId: string;
  status: "in_progress" | "completed";
  role: "assistant";
  text: string;
}): JsonObject {
  const content: unknown[] = params.status === "in_progress"
    ? []
    : [{ type: "output_text", text: params.text, annotations: [] }];

  return {
    id: params.itemId,
    type: "message",
    status: params.status,
    role: params.role,
    content
  };
}

function buildResponseObject(params: {
  reqJson: JsonObject;
  id: string;
  model: string;
  createdAtSeconds: number;
  status: ResponseStatus;
  completedAtSeconds: number | null;
  output: unknown[];
  usage: unknown | null;
}): JsonObject {
  const reqText = getOptionalObject(params.reqJson, "text");
  const reqTextFormat = reqText ? getOptionalObject(reqText, "format") : null;
  const text = reqText ? reqText : { format: reqTextFormat ?? { type: "text" } };

  return {
    id: params.id,
    object: "response",
    created_at: params.createdAtSeconds,
    status: params.status,
    completed_at: params.completedAtSeconds,
    error: null,
    incomplete_details: null,
    instructions: params.reqJson.instructions ?? null,
    max_output_tokens: getOptionalNumber(params.reqJson, "max_output_tokens"),
    max_tool_calls: getOptionalNumber(params.reqJson, "max_tool_calls"),
    model: params.model,
    output: params.output,
    parallel_tool_calls: getOptionalBoolean(params.reqJson, "parallel_tool_calls") ?? true,
    previous_response_id: getOptionalString(params.reqJson, "previous_response_id"),
    reasoning: getOptionalObject(params.reqJson, "reasoning") ?? { effort: null, summary: null },
    store: getOptionalBoolean(params.reqJson, "store") ?? true,
    temperature: getOptionalNumber(params.reqJson, "temperature") ?? 1,
    text,
    tool_choice: params.reqJson.tool_choice ?? "auto",
    tools: getOptionalArray(params.reqJson, "tools") ?? [],
    top_p: getOptionalNumber(params.reqJson, "top_p") ?? 1,
    truncation: getOptionalString(params.reqJson, "truncation") ?? "disabled",
    usage: params.usage,
    user: params.reqJson.user ?? null,
    metadata: (getOptionalObject(params.reqJson, "metadata") ?? {}) as unknown
  };
}

function sseHeaders(): Record<string, string> {
  return {
    ...corsHeaders(),
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  };
}

function sseEncode(obj: unknown): Uint8Array {
  return new TextEncoder().encode("data: " + JSON.stringify(obj) + "\n\n");
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

  const reqJson = (await request.json()) as JsonObject;
  const requestedStream = coerceBoolean(reqJson.stream);
  const model = (typeof reqJson.model === "string" && reqJson.model) ? reqJson.model : "gpt-4o";

  if (reqJson.background === true) {
    return sendError("`background: true` is not supported by this proxy.", 400);
  }

  const messages = buildChatMessagesFromResponsesInput(reqJson);
  if (messages.length === 0) {
    return sendError("Missing input/messages for /v1/responses.", 400);
  }

  const isReasoningModel = model.startsWith("o1") || model.startsWith("o3");
  const stream = isReasoningModel ? false : requestedStream;

  // Build a Chat Completions-compatible payload for the Copilot upstream.
  const chatReq: JsonObject = {
    model,
    messages,
    stream,
    temperature: reqJson.temperature,
    top_p: reqJson.top_p,
    max_tokens: reqJson.max_tokens,
    tools: reqJson.tools,
    tool_choice: reqJson.tool_choice,
    parallel_tool_calls: reqJson.parallel_tool_calls,
    presence_penalty: reqJson.presence_penalty,
    frequency_penalty: reqJson.frequency_penalty,
    logprobs: reqJson.logprobs,
    top_logprobs: reqJson.top_logprobs
  };

  // Responses uses max_output_tokens; ChatCompletions uses max_tokens.
  if (typeof chatReq.max_tokens !== "number" && typeof reqJson.max_output_tokens === "number") {
    chatReq.max_tokens = reqJson.max_output_tokens;
  }

  // Translate Responses `text.format` to ChatCompletions `response_format` when possible.
  const text = getOptionalObject(reqJson, "text");
  const format = text ? getOptionalObject(text, "format") : null;
  if (format && typeof format.type === "string") {
    if (format.type === "json_object") {
      chatReq.response_format = { type: "json_object" };
    } else if (format.type === "json_schema") {
      chatReq.response_format = { type: "json_schema", json_schema: (format as JsonObject).json_schema };
    }
  }

  const requestState = {
    ...baseState,
    copilotToken: token,
    vsCodeVersion: baseState.vsCodeVersion || "1.109.0-insider"
  };
  const headersObj = copilotHeaders(requestState, true);
  const apiUrl = `${copilotBaseUrl(requestState)}/v1/responses`;
  const init: RequestInit = {
    method: "POST",
    headers: headersObj,
    body: JSON.stringify(chatReq)
  };

  const responseId = "resp_" + crypto.randomUUID();
  const outputItemId = "msg_" + crypto.randomUUID();
  const createdAtSeconds = Math.floor(Date.now() / 1000);
  const createdBase = buildResponseObject({
    reqJson,
    id: responseId,
    model,
    createdAtSeconds,
    status: "in_progress",
    completedAtSeconds: null,
    output: [],
    usage: null
  });

  // For o1/o3 models, Copilot may not support stream; if the client requested stream, emit Responses-style SSE anyway.
  if (isReasoningModel) {
    const apiResp = await fetch(apiUrl, init);
    if (!apiResp.ok) {
      const errText = await apiResp.text();
      return sendError(`API Error: ${apiResp.status} - ${errText}`, apiResp.status);
    }

    const responseBody = await apiResp.text();
    let responseJson: JsonObject;
    try {
      responseJson = JSON.parse(responseBody) as JsonObject;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return sendError("Unable to parse API response JSON: " + message, 500);
    }

    const choices = Array.isArray(responseJson.choices) ? responseJson.choices : [];
    const firstChoice = (choices[0] ?? null) as unknown;
    const assistantText = isJsonObject(firstChoice) && isJsonObject(firstChoice.message)
      ? extractTextFromContent(firstChoice.message.content)
      : "";

    const completedAtSeconds = Math.floor(Date.now() / 1000);
    const item = buildOutputMessageItem({
      itemId: outputItemId,
      status: "completed",
      role: "assistant",
      text: assistantText
    });
    const respObj = buildResponseObject({
      reqJson,
      id: responseId,
      model: (typeof responseJson.model === "string" ? responseJson.model : model),
      createdAtSeconds,
      status: "completed",
      completedAtSeconds,
      output: [item],
      usage: (responseJson.usage ?? null)
    });

    if (!requestedStream) {
      return new Response(JSON.stringify(respObj), {
        status: 200,
        headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" }
      });
    }

    const { readable, writable } = new TransformStream();
    (async () => {
      const writer = writable.getWriter();
      let sequenceNumber = 1;
      try {
        await writer.write(sseEncode({ type: "response.created", response: createdBase, sequence_number: sequenceNumber++ }));
        await writer.write(sseEncode({
          type: "response.output_item.added",
          output_index: 0,
          item: buildOutputMessageItem({ itemId: outputItemId, status: "in_progress", role: "assistant", text: "" }),
          sequence_number: sequenceNumber++
        }));
        await writer.write(sseEncode({
          type: "response.content_part.added",
          item_id: outputItemId,
          output_index: 0,
          content_index: 0,
          part: { type: "output_text", text: "", annotations: [] },
          sequence_number: sequenceNumber++
        }));
        if (assistantText) {
          await writer.write(sseEncode({
            type: "response.output_text.delta",
            item_id: outputItemId,
            output_index: 0,
            content_index: 0,
            delta: assistantText,
            sequence_number: sequenceNumber++
          }));
        }
        await writer.write(sseEncode({
          type: "response.output_text.done",
          item_id: outputItemId,
          output_index: 0,
          content_index: 0,
          text: assistantText,
          sequence_number: sequenceNumber++
        }));
        await writer.write(sseEncode({
          type: "response.content_part.done",
          item_id: outputItemId,
          output_index: 0,
          content_index: 0,
          part: { type: "output_text", text: assistantText, annotations: [] },
          sequence_number: sequenceNumber++
        }));
        await writer.write(sseEncode({
          type: "response.output_item.done",
          output_index: 0,
          item,
          sequence_number: sequenceNumber++
        }));
        await writer.write(sseEncode({ type: "response.completed", response: respObj, sequence_number: sequenceNumber++ }));
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, { headers: sseHeaders() });
  }

  if (stream) {
    const apiResp = await fetch(apiUrl, init);
    if (!apiResp.ok) {
      const errText = await apiResp.text();
      return sendError(`API Error: ${apiResp.status} - ${errText}`, apiResp.status);
    }
    if (!apiResp.body) {
      return sendError("API Error: empty response body", 502);
    }

    const upstreamReader = apiResp.body.getReader();
    const decoder = new TextDecoder("utf-8");

    const { readable, writable } = new TransformStream();
    (async () => {
      const writer = writable.getWriter();
      let buffer = "";
      let assistantText = "";
      let sequenceNumber = 1;
      try {
        await writer.write(sseEncode({ type: "response.created", response: createdBase, sequence_number: sequenceNumber++ }));
        await writer.write(sseEncode({
          type: "response.output_item.added",
          output_index: 0,
          item: buildOutputMessageItem({ itemId: outputItemId, status: "in_progress", role: "assistant", text: "" }),
          sequence_number: sequenceNumber++
        }));
        await writer.write(sseEncode({
          type: "response.content_part.added",
          item_id: outputItemId,
          output_index: 0,
          content_index: 0,
          part: { type: "output_text", text: "", annotations: [] },
          sequence_number: sequenceNumber++
        }));

        while (true) {
          const { done, value } = await upstreamReader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line) continue;
            if (!line.startsWith("data: ")) continue;

            const data = line.substring(6).trim();
            if (data === "[DONE]") {
              const completedAtSeconds = Math.floor(Date.now() / 1000);
              const item = buildOutputMessageItem({
                itemId: outputItemId,
                status: "completed",
                role: "assistant",
                text: assistantText
              });
              const respObj = buildResponseObject({
                reqJson,
                id: responseId,
                model,
                createdAtSeconds,
                status: "completed",
                completedAtSeconds,
                output: [item],
                usage: null
              });

              await writer.write(sseEncode({
                type: "response.output_text.done",
                item_id: outputItemId,
                output_index: 0,
                content_index: 0,
                text: assistantText,
                sequence_number: sequenceNumber++
              }));
              await writer.write(sseEncode({
                type: "response.content_part.done",
                item_id: outputItemId,
                output_index: 0,
                content_index: 0,
                part: { type: "output_text", text: assistantText, annotations: [] },
                sequence_number: sequenceNumber++
              }));
              await writer.write(sseEncode({
                type: "response.output_item.done",
                output_index: 0,
                item,
                sequence_number: sequenceNumber++
              }));
              await writer.write(sseEncode({ type: "response.completed", response: respObj, sequence_number: sequenceNumber++ }));
              return;
            }

            try {
              const sseJson = JSON.parse(data) as JsonObject;
              const choices = Array.isArray(sseJson.choices) ? sseJson.choices : [];
              for (const choice of choices) {
                if (!isJsonObject(choice)) continue;
                const delta = choice.delta;
                if (!isJsonObject(delta)) continue;
                const chunk = delta.content;
                if (typeof chunk !== "string" || !chunk) continue;
                assistantText += chunk;
                await writer.write(sseEncode({
                  type: "response.output_text.delta",
                  item_id: outputItemId,
                  output_index: 0,
                  content_index: 0,
                  delta: chunk,
                  sequence_number: sequenceNumber++
                }));
              }
            } catch (e) {
              const message = e instanceof Error ? e.message : String(e);
              console.error("JSON parsing error: " + message);
            }
          }
        }

        const completedAtSeconds = Math.floor(Date.now() / 1000);
        const item = buildOutputMessageItem({
          itemId: outputItemId,
          status: "completed",
          role: "assistant",
          text: assistantText
        });
        const respObj = buildResponseObject({
          reqJson,
          id: responseId,
          model,
          createdAtSeconds,
          status: "completed",
          completedAtSeconds,
          output: [item],
          usage: null
        });

        await writer.write(sseEncode({
          type: "response.output_text.done",
          item_id: outputItemId,
          output_index: 0,
          content_index: 0,
          text: assistantText,
          sequence_number: sequenceNumber++
        }));
        await writer.write(sseEncode({
          type: "response.content_part.done",
          item_id: outputItemId,
          output_index: 0,
          content_index: 0,
          part: { type: "output_text", text: assistantText, annotations: [] },
          sequence_number: sequenceNumber++
        }));
        await writer.write(sseEncode({
          type: "response.output_item.done",
          output_index: 0,
          item,
          sequence_number: sequenceNumber++
        }));
        await writer.write(sseEncode({ type: "response.completed", response: respObj, sequence_number: sequenceNumber++ }));
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, { headers: sseHeaders() });
  }

  const apiResp = await fetch(apiUrl, init);
  if (!apiResp.ok) {
    const errText = await apiResp.text();
    return sendError(`API Error: ${apiResp.status} - ${errText}`, apiResp.status);
  }

  const responseBody = await apiResp.text();
  let responseJson: JsonObject;
  try {
    responseJson = JSON.parse(responseBody) as JsonObject;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return sendError("Unable to parse API response JSON: " + message, 500);
  }

  const choices = Array.isArray(responseJson.choices) ? responseJson.choices : [];
  const firstChoice = (choices[0] ?? null) as unknown;
  const assistantText = isJsonObject(firstChoice) && isJsonObject(firstChoice.message)
    ? extractTextFromContent(firstChoice.message.content)
    : "";

  const completedAtSeconds = Math.floor(Date.now() / 1000);
  const item = buildOutputMessageItem({
    itemId: outputItemId,
    status: "completed",
    role: "assistant",
    text: assistantText
  });
  const respObj = buildResponseObject({
    reqJson,
    id: responseId,
    model: (typeof responseJson.model === "string" ? responseJson.model : model),
    createdAtSeconds,
    status: "completed",
    completedAtSeconds,
    output: [item],
    usage: (responseJson.usage ?? null)
  });

  return new Response(JSON.stringify(respObj), {
    status: 200,
    headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" }
  });
}
