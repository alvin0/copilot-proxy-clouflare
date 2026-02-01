import { serve } from "@hono/node-server";
import "dotenv/config";
import app from "./router";
import { createCloudflareKvApiFromEnv } from "./kv/cloudflare-kv-api";

const port = Number(process.env.PORT || 8787);
const tokenKv = createCloudflareKvApiFromEnv(process.env);

serve({
  fetch: (req: Request) => app.fetch(req, { TOKEN_KV: tokenKv }),
  port
});

console.log(`Hono node server running on http://localhost:${port}`);
