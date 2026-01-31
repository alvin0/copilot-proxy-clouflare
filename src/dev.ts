import "dotenv/config";
import { serve } from "@hono/node-server";
import app from "./router";

const port = Number(process.env.PORT || 8787);

const longTermToken = process.env.LONG_TERM_TOKEN;

serve({
  fetch: (req: Request) => app.fetch(req, { LONG_TERM_TOKEN: longTermToken }),
  port
});

console.log(`Hono node server running on http://localhost:${port}`);
