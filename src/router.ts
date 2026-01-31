import { Hono } from "hono";
import { handleChatCompletions } from "./handlers/chatCompletions";
import { handleEmbeddings } from "./handlers/embeddings";
import { getModelsWithCache, handleModels } from "./handlers/models";
import { getCopilotUsage } from "./handlers/usage";
import { renderChatPage } from "./templates/chatPage";
import { renderTokenPage } from "./templates/tokenPage";
import { getStoredLongTermToken } from "./token";

type EnvBindings = {
  TOKEN_KV?: KVNamespace;
};

const app = new Hono<{ Bindings: EnvBindings }>();

app.get("/", async c => {
  const status = c.req.query("status") as "saved" | "invalid" | "kv-missing" | undefined;
  let usage;
  let usageError;
  let models;
  let modelsError;
  const storedToken = await getStoredLongTermToken(c.env?.TOKEN_KV);
  if (storedToken) {
    try {
      const usageResponse = await getCopilotUsage(storedToken);
      usage = {
        chat: usageResponse.quota_snapshots.chat,
        completions: usageResponse.quota_snapshots.completions,
        premium_interactions: usageResponse.quota_snapshots.premium_interactions,
        quota_reset_date: usageResponse.quota_reset_date,
        copilot_plan: usageResponse.copilot_plan
      };
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
  return c.html(renderTokenPage({
    status,
    hasToken: Boolean(storedToken),
    usage,
    usageError,
    models,
    modelsError
  }));
});

app.get("/chat", async c => {
  const storedToken = await getStoredLongTermToken(c.env?.TOKEN_KV);
  if (!storedToken) {
    return c.html(renderChatPage([]));
  }
  try {
    const cache = await getModelsWithCache(storedToken, c.env?.TOKEN_KV);
    return c.html(renderChatPage(cache.data));
  } catch (_) {
    return c.html(renderChatPage([]));
  }
});

app.post("/", async c => {
  if (!c.env?.TOKEN_KV) {
    return c.html(renderTokenPage({ status: "kv-missing" }), 500);
  }
  const form = await c.req.formData();
  const token = String(form.get("token") || "").trim();
  if (!token || !(token.startsWith("ghu") || token.startsWith("gho"))) {
    return c.html(renderTokenPage({ status: "invalid" }), 400);
  }
  await c.env.TOKEN_KV.put("longTermToken", token);
  return c.redirect("/?status=saved", 303);
});

app.all("/v1/chat/completions", c =>
  handleChatCompletions(c.req.raw, undefined, c.env?.TOKEN_KV)
);
app.all("/v1/embeddings", c =>
  handleEmbeddings(c.req.raw, undefined, c.env?.TOKEN_KV)
);
app.all("/v1/models", c =>
  handleModels(c.req.raw, undefined, c.env?.TOKEN_KV)
);

app.get("*", () => {
  const html = `<html><head><title>Welcome to API</title></head>
        <body><h1>Welcome to API</h1>
        <p>This API is used to interact with the GitHub Copilot model.</p></body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
});

app.all("*", () => new Response("Not found", { status: 404 }));

export default app;
