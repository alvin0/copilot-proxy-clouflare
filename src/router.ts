import { Hono } from "hono";
import { handleChatCompletions } from "./handlers/chatCompletions";
import { handleEmbeddings } from "./handlers/embeddings";
import { handleModels } from "./handlers/models";
import { renderTokenPage } from "./templates/tokenPage";

type EnvBindings = {
  TOKEN_KV?: KVNamespace;
};

const app = new Hono<{ Bindings: EnvBindings }>();

app.get("/", c => {
  const status = c.req.query("status") as "saved" | "invalid" | "kv-missing" | undefined;
  return c.html(renderTokenPage({ status }));
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
