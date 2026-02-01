import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { handleChatCompletions } from "./handlers/chatCompletions";
import { handleEmbeddings } from "./handlers/embeddings";
import { getModelsWithCache, handleModels } from "./handlers/models";
import { handleMessages } from "./handlers/messages";
import { handleResponses } from "./handlers/responses";
import { getCopilotUsage } from "./handlers/usage";
import { handleGetDeviceCode, handlePollDeviceCode } from "./handlers/getDeviceCode";
import { renderChatPage } from "./templates/chatPage";
import { renderTokenPage } from "./templates/tokenPage";
import {
  getUserLongTermToken,
  getUserPassword,
  isValidPassword,
  isValidUsername,
  saveUserCredentials
} from "./token";
import { withFreeFlag } from "./configs/free-models";
import type { KvNamespaceLike } from "./kv/kv-types";
import { sendError } from "./response";

type EnvBindings = {
  TOKEN_KV?: KvNamespaceLike;
};

const app = new Hono<{ Bindings: EnvBindings }>();

const requireUserAuth: MiddlewareHandler<{ Bindings: EnvBindings }> = async (c, next) => {
  const username = c.req.param("username");
  if (!username || !isValidUsername(username)) {
    return sendError("Invalid username.", 400);
  }
  if (!c.env?.TOKEN_KV) {
    return sendError("KV binding is missing.", 500);
  }
  const storedPassword = await getUserPassword(username, c.env.TOKEN_KV);
  if (!storedPassword) {
    return sendError("Unknown user.", 401);
  }
  const auth = c.req.header("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!bearer) {
    return sendError("Missing Authorization bearer token.", 401);
  }
  if (bearer !== storedPassword) {
    return sendError("Invalid credentials.", 401);
  }
  await next();
};

app.get("/", async c => {
  const status = c.req.query("status") as
    | "saved"
    | "invalid"
    | "kv-missing"
    | "invalid-username"
    | "invalid-password"
    | "auth-failed"
    | undefined;
  const username = c.req.query("username")?.trim() || "";
  const password = c.req.query("password")?.trim() || "";
  const debug = c.req.query("debug")?.trim() === "1";
  let usage;
  let usageError;
  let models;
  let modelsError;
  let usageDebug: unknown;
  const storedToken = username ? await getUserLongTermToken(username, c.env?.TOKEN_KV) : null;
  const storedPassword = username ? await getUserPassword(username, c.env?.TOKEN_KV) : null;
  const canReadUsage = Boolean(storedToken && storedPassword && password && storedPassword === password);
  if (storedToken && canReadUsage) {
    try {
      const usageResponse = await getCopilotUsage(storedToken);
      if (debug) usageDebug = usageResponse;
      const snapshots = usageResponse.quota_snapshots;
      if (!snapshots?.chat || !snapshots?.completions || !snapshots?.premium_interactions) {
        usageError = "Usage data not available for this account.";
      } else {
        usage = {
          chat: snapshots.chat,
          completions: snapshots.completions,
          premium_interactions: snapshots.premium_interactions,
          quota_reset_date: usageResponse.quota_reset_date,
          copilot_plan: usageResponse.copilot_plan
        };
      }
    } catch (e) {
      usageError = e instanceof Error ? e.message : String(e);
    }
    try {
      const modelsCache = await getModelsWithCache(storedToken, c.env?.TOKEN_KV);
      models = {
        items: modelsCache.data,
        fetchedAt: modelsCache.fetchedAt
      };
    } catch (e) {
      modelsError = e instanceof Error ? e.message : String(e);
    }
  }
  const effectiveStatus = (storedToken && password && !canReadUsage) ? "auth-failed" : status;
  return c.html(renderTokenPage({
    status: effectiveStatus,
    hasToken: Boolean(storedToken),
    username: username || undefined,
    password: password || undefined,
    usageDebug: debug ? usageDebug : undefined,
    usage,
    usageError,
    models,
    modelsError
  }));
});

app.get("/chat", async c => {
  const username = c.req.query("username")?.trim() || "";
  const password = c.req.query("password")?.trim() || "";
  const storedToken = username ? await getUserLongTermToken(username, c.env?.TOKEN_KV) : null;
  if (!storedToken) {
    return c.html(renderChatPage([], username || undefined, password || undefined));
  }
  try {
    const cache = await getModelsWithCache(storedToken, c.env?.TOKEN_KV);
    return c.html(renderChatPage(withFreeFlag(cache.data), username || undefined, password || undefined));
  } catch (_) {
    return c.html(renderChatPage([], username || undefined, password || undefined));
  }
});

app.post("/", async c => {
  if (!c.env?.TOKEN_KV) {
    return c.html(renderTokenPage({ status: "kv-missing" }), 500);
  }
  const form = await c.req.formData();
  const token = String(form.get("token") || "").trim();
  const username = String(form.get("username") || "").trim();
  const password = String(form.get("password") || "").trim();
  if (!token || !(token.startsWith("ghu") || token.startsWith("gho"))) {
    return c.html(renderTokenPage({ status: "invalid" }), 400);
  }
  if (!isValidUsername(username)) {
    return c.html(renderTokenPage({ status: "invalid-username" }), 400);
  }
  if (!isValidPassword(password)) {
    return c.html(renderTokenPage({ status: "invalid-password" }), 400);
  }
  await saveUserCredentials(username, password, token, c.env.TOKEN_KV);
  return c.redirect(
    `/?status=saved&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    303
  );
});

app.use("/:username/v1/*", requireUserAuth);

app.all("/:username/v1/chat/completions", async c => {
  const username = c.req.param("username");
  const auth = c.req.header("Authorization") || "";
  const password = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const token = await getUserLongTermToken(username, c.env?.TOKEN_KV);
  return handleChatCompletions(c.req.raw, token ?? undefined, c.env?.TOKEN_KV, username, password);
});
app.all("/:username/v1/responses", async c => {
  const username = c.req.param("username");
  const auth = c.req.header("Authorization") || "";
  const password = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const token = await getUserLongTermToken(username, c.env?.TOKEN_KV);
  return handleResponses(c.req.raw, token ?? undefined, c.env?.TOKEN_KV, username, password);
});
app.all("/:username/v1/messages", async c => {
  const username = c.req.param("username");
  const auth = c.req.header("Authorization") || "";
  const password = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const token = await getUserLongTermToken(username, c.env?.TOKEN_KV);
  return handleMessages(c.req.raw, token ?? undefined, c.env?.TOKEN_KV, username, password);
});
app.all("/:username/v1/embeddings", async c => {
  const username = c.req.param("username");
  const auth = c.req.header("Authorization") || "";
  const password = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const token = await getUserLongTermToken(username, c.env?.TOKEN_KV);
  return handleEmbeddings(c.req.raw, token ?? undefined, c.env?.TOKEN_KV, username, password);
});
app.all("/:username/v1/models", async c => {
  const username = c.req.param("username");
  const auth = c.req.header("Authorization") || "";
  const password = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const token = await getUserLongTermToken(username, c.env?.TOKEN_KV);
  return handleModels(c.req.raw, token ?? undefined, c.env?.TOKEN_KV, username, password);
});

app.all("/github/get-device-code", c => handleGetDeviceCode(c.req.raw));
app.all("/github/poll-device-code", c => handlePollDeviceCode(c.req.raw));

app.get("*", () => {
  const html = `<html><head><title>Welcome to API</title></head>
        <body><h1>Welcome to API</h1>
        <p>This API is used to interact with the GitHub Copilot model.</p></body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
});

app.all("*", () => new Response("Not found", { status: 404 }));

export default app;
