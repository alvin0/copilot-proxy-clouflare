import { serve } from "@hono/node-server";
import app from "./router";

const port = Number(process.env.PORT || 8787);

serve({
  fetch: (req: Request) => app.fetch(req, { TOKEN_KV: undefined }),
  port
});

console.log(`Hono node server running on http://localhost:${port}`);
