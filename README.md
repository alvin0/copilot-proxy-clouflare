# copilot-proxy-clouflare

A Cloudflare Workers (Hono) proxy that exposes “OpenAI/Anthropic-like” endpoints backed by GitHub Copilot.

Goals:
- Use the Worker URL as an “OpenAI base URL” for tools/apps.
- Automatically refresh short‑lived Copilot tokens from a GitHub long‑term token.
- Support multiple users via `username + password`.

## Key features
- Token setup UI at `GET /` (includes GitHub Device Flow).
- Chat UI at `GET /chat` (streaming + image/file attachments via OpenAI content parts).
- OpenAI-compatible:
  - `POST /:username/v1/chat/completions` (SSE streaming)
  - `POST /:username/v1/responses` (SSE streaming)
  - `POST /:username/v1/embeddings`
  - `GET /:username/v1/models` (cached + `free` flag)
- Anthropic-compatible (shim over `/v1/responses`):
  - `POST /:username/v1/messages` (SSE streaming)
- Supports selecting upstream domain via `x-copilot-account-type` (Copilot Enterprise).

## Quick flow
1) Run locally or deploy to Cloudflare.
2) Open `GET /` to create **username + password** and save a GitHub token (`ghu...` / `gho...`).
3) Call API as `/{username}/v1/...` with:
   - `Authorization: Bearer <password>`

## Use With Tools (OpenAI Base URL)
Most OpenAI-compatible tools only need:
- Base URL: `https://<your-worker-domain>/<username>/v1`
- API key: `<password>` (the UI-generated `acpc-...` password)

Examples:

OpenAI JS/TS SDK:
```js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // set this to your acpc-... password
  baseURL: "https://<your-worker-domain>/<username>/v1"
});
```

OpenAI Python SDK:
```py
import os
from openai import OpenAI

client = OpenAI(
  api_key=os.environ["OPENAI_API_KEY"],  # set this to your acpc-... password
  base_url="https://<your-worker-domain>/<username>/v1",
)
```

Notes:
- The password is used as a Bearer token (`Authorization: Bearer <password>`). Many tools label it as “API key”.
- For Anthropic SDKs, set the base URL to `https://<your-worker-domain>/<username>` so requests go to `.../<username>/v1/messages`.

## Username/password rules
- `username`: lowercase letters, numbers, `-` (regex: `^[a-z0-9]+(?:-[a-z0-9]+)*$`).
- `password`: format `acpc-XXXXXXXXXX` (10 alphanumeric chars).
- The UI includes **Generate** to create a valid password.

## Storage (KV)
Binding: `TOKEN_KV`
- Stores user credentials + tokens per `username`.
- Caches short-lived tokens (TTL) by credential.
- Caches model list by account type.

## Requirements
- Node.js (dev tooling)
- Cloudflare account + Wrangler (run/deploy)

## Install
```bash
npm ci
```

## Run locally

### 1) Wrangler (recommended)
1) Create the KV namespace (one-time):
```bash
npx wrangler kv namespace create TOKEN_KV
```

2) Paste the returned `id` into `wrangler.json`.

3) Run dev:
```bash
npm run dev:cf
```

Open:
- `http://localhost:8787/` to set the token
- `http://localhost:8787/chat` to chat

### 2) Node (handy for debugging)
`npm run dev` runs a Hono Node server and can read/write Cloudflare KV via the REST API.

1) Copy env:
```bash
cp .env.example .env
```

2) Fill required values:
- `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_KV_NAMESPACE_ID`

3) Run:
```bash
npm run dev
```

Notes:
- If `CF_*` is missing, the server still runs but:
  - `POST /` returns `kv-missing`
  - API returns `401` because KV is unavailable
- `LONG_TERM_TOKEN` in `.env.example` is currently not used for `/:username/v1/*` routes.

## Deploy to Cloudflare (Wrangler)
`wrangler.json` points to `src/index.ts`.

```bash
npx wrangler login
npm run deploy
```

After deploy, visit:
- `https://<your-worker-domain>/` to create user + save token
- `https://<your-worker-domain>/chat` to chat

## CI/CD (GitHub Actions)
Workflow: `.github/workflows/deploy.yml` auto-deploys on pushes to `main` and auto-creates the KV namespace if missing.

Required secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The workflow uses `environment: CLOUDFLARE_API_TOKEN` (if you use GitHub Environments).

## Auth & security
- **All API calls require** `Authorization: Bearer <password>`.
- All API endpoints are under `/:username/v1/*`.
- CORS enabled with `Access-Control-Allow-Origin: *` for `GET, POST, OPTIONS`.
- Recommendation: deploy privately or add an extra protection layer (Access policy / auth gateway) to avoid leaking Copilot quota.

## Supported headers
- `x-copilot-account-type`: e.g. `enterprise-name`
  - Upstream becomes `https://api.<enterprise-name>.githubcopilot.com`.
  - Header is constrained to `[a-z0-9-]` to avoid an open proxy.

## Endpoints

### UI
- `GET /`: token setup form + GitHub Device Flow
- `POST /`: save `username + password + token`
- `GET /chat`: chat UI

### OpenAI-compatible

#### Chat Completions
`POST /:username/v1/chat/completions`

Example (stream):
```bash
curl -N http://localhost:8787/<username>/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <password>" \
  -d '{
    "model": "gpt-4o",
    "stream": true,
    "messages": [
      {"role":"user","content":"Hello"}
    ]
  }'
```

Notes:
- `o1*`/`o3*` models are forced to `stream=false` and wrapped into a single SSE event.
- `messages[].content` can be a string or OpenAI “content parts”.

#### Responses
`POST /:username/v1/responses`

```bash
curl http://localhost:8787/<username>/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <password>" \
  -d '{
    "model": "gpt-4o",
    "input": [
      {"role":"user","content":"Write a haiku about TypeScript"}
    ]
  }'
```

#### Embeddings
`POST /:username/v1/embeddings`

```bash
curl http://localhost:8787/<username>/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <password>" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "hello world"
  }'
```

Notes:
- If `input` is a string, it is normalized to a one-item array.
- If `model` has the `github_copilot/` prefix, the proxy strips it before calling upstream.

#### Models
`GET /:username/v1/models`

```bash
curl http://localhost:8787/<username>/v1/models \
  -H "Authorization: Bearer <password>"
```

Notes:
- With token: fetches `/models` from Copilot and adds `free` if it matches the internal list.
- Without token: returns `{ data: [], object: "list" }`.

### Anthropic-compatible

#### Messages
`POST /:username/v1/messages`

```bash
curl http://localhost:8787/<username>/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <password>" \
  -d '{
    "model": "gpt-4o",
    "max_tokens": 256,
    "messages": [
      {"role":"user","content":"Summarize this in one sentence."}
    ]
  }'
```

Notes:
- The proxy maps Anthropic Messages to OpenAI Responses and maps them back.
- `o1*`/`o3*` always use `stream=false`.

### GitHub Device Flow helpers (for `/` UI)
- `POST /github/get-device-code` (or `GET`)
- `POST /github/poll-device-code` body `{ "device_code": "..." }`
  - `200`: `access_token` available
  - `202`: `authorization_pending`
  - `429`: `slow_down`
  - `403`: `access_denied`
  - `410`: `expired_token`

## Quick troubleshooting
- `401 Token is invalid.`: token not saved in KV or KV/`CF_*` not configured.
- `kv-missing` at `/`: running Node dev without `CF_API_TOKEN`/`CF_ACCOUNT_ID`/`CF_KV_NAMESPACE_ID`.
- Models not showing in `/chat`: token missing or `/models` fetch failed.

## Notes
- This repo uses `wrangler.json` (not `wrangler.toml`).
