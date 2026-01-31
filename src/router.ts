import { Hono } from "hono";
import { handleChatCompletions } from "./handlers/chatCompletions";
import { handleEmbeddings } from "./handlers/embeddings";
import { handleModels } from "./handlers/models";

type EnvBindings = {
  LONG_TERM_TOKEN?: string;
  TOKEN_KV?: KVNamespace;
};

const app = new Hono<{ Bindings: EnvBindings }>();

app.all("/v1/chat/completions", c =>
  handleChatCompletions(c.req.raw, c.env?.LONG_TERM_TOKEN, c.env?.TOKEN_KV)
);
app.all("/v1/embeddings", c =>
  handleEmbeddings(c.req.raw, c.env?.LONG_TERM_TOKEN, c.env?.TOKEN_KV)
);
app.all("/v1/models", c =>
  handleModels(c.req.raw, c.env?.LONG_TERM_TOKEN, c.env?.TOKEN_KV)
);

app.get("*", () => {
  const html = `<html><head><title>Welcome to API</title></head>
        <body><h1>Welcome to API</h1>
        <p>This API is used to interact with the GitHub Copilot model.</p></body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
});

app.all("*", () => new Response("Not found", { status: 404 }));

export default app;
