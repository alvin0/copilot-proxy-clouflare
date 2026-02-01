# copilot-proxy-clouflare

A Cloudflare Workers (Hono) proxy that exposes “OpenAI/Anthropic-like” endpoints backed by GitHub Copilot as the upstream.

Main goals:
- Use the Worker URL as an “OpenAI base URL” for tools/apps (OpenAI-compatible).
- Automatically refresh short‑lived Copilot tokens from a GitHub long‑term token.

## Features
- Token setup UI at `GET /` (includes GitHub Device Flow to obtain a token)
- Quick chat UI at `GET /chat` (streaming + image/file attachments using OpenAI message content parts)
- OpenAI-compatible:
  - `POST /v1/chat/completions` (streaming SSE)
  - `POST /v1/responses` (streaming SSE)
  - `POST /v1/embeddings`
  - `GET /v1/models` (fetches models from Copilot when a token is available; otherwise returns an empty list)
- Anthropic-compatible (shim on top of `/v1/responses`):
  - `POST /v1/messages` (streaming SSE supported)
- Supports selecting the upstream domain via `x-copilot-account-type` (for Copilot Enterprise)

## Architecture & storage
- KV binding: `TOKEN_KV`
  - Key `longTermToken`: stores the GitHub long‑term token (prefix `ghu`/`gho`)
  - Key `token:<longTermToken>`: caches the short‑lived Copilot token (with TTL)
  - Key `modelsCache:<accountType>`: caches the models list
- Note: the current deployment supports **one long‑term token** (it overwrites the previous one when you save a new token via `/`).

## Requirements
- Node.js (for dev tooling)
- Cloudflare account + Wrangler (to run/deploy Workers)

## Install
```bash
npm ci
```

## Run locally

### 1) Wrangler (recommended)
Wrangler uses the Workers runtime and bindings (the KV binding works directly).

1) Create the KV namespace (one time):
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

### 2) Node (convenient for debugging)
`npm run dev` runs a Hono Node server and can **optionally** read/write Cloudflare KV via the REST API.

1) Copy env:
```bash
cp .env.example .env
```

2) Fill these (required if you want the API to work):
- `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_KV_NAMESPACE_ID`

3) Run:
```bash
npm run dev
```

Notes:
- If you don’t set the required `CF_*`, the server still runs but:
  - `POST /` returns `kv-missing`
  - `/v1/*` endpoints return `401` because the proxy can’t refresh tokens.
- `LONG_TERM_TOKEN` in `.env.example` is currently **not used** (the proxy reads the token from KV).

## Deploy to Cloudflare (Wrangler)
`wrangler.json` points the entry to `src/index.ts`.

```bash
npx wrangler login
npm run deploy
```

After deploy, visit:
- `https://<your-worker-domain>/` to save the long‑term token
- `https://<your-worker-domain>/chat` to chat

## CI/CD (GitHub Actions)
Workflow: `.github/workflows/deploy.yml` auto-deploys on pushes to `main` and auto-creates the KV namespace if missing.

Required secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The workflow sets `environment: CLOUDFLARE_API_TOKEN` (if you use GitHub Environments to scope secrets, create an Environment with that exact name; or rename it in the workflow).

## Auth & security
- Requests do **not** require an `Authorization` header. The proxy reads the long‑term token from KV, exchanges it for a short‑lived Copilot token, and calls upstream.
- CORS is enabled with `Access-Control-Allow-Origin: *` for `GET, POST, OPTIONS`.
- Recommendation: deploy privately or add an extra protection layer (Access policy / auth gateway), because anyone who can access the Worker can consume Copilot quota for the stored token.

## Supported headers
- `x-copilot-account-type`: when set (e.g. `enterprise-name`), upstream becomes `https://api.<enterprise-name>.githubcopilot.com` instead of `https://api.githubcopilot.com`.
  - This header is constrained to `[a-z0-9-]` to avoid turning this into an open proxy for arbitrary domains.

## Endpoints

### UI
- `GET /`: token setup page (form expects `ghu...`/`gho...`) + GitHub Device Flow
- `POST /`: saves the token into KV (key `longTermToken`)
- `GET /chat`: chat UI (uses `/v1/chat/completions`)

### OpenAI-compatible

#### Chat Completions
`POST /v1/chat/completions`

Example (stream):
```bash
curl -N http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "stream": true,
    "messages": [
      {"role":"user","content":"Hello"}
    ]
  }'
```

Notes:
- For `o1*`/`o3*` models, upstream is forced to `stream=false`. The proxy wraps the non-stream result into a single SSE event (so clients can still read it as a stream).
- `messages[].content` can be a string or an array of OpenAI-style “content parts” (e.g. `[{ "type":"text","text":"..." }, { "type":"image_url","image_url":{ "url":"data:image/png;base64,..." } }]`). The `/chat` UI uses this format.

#### Responses
`POST /v1/responses`

Example (non-stream):
```bash
curl http://localhost:8787/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "input": [
      {"role":"user","content":"Write a haiku about TypeScript"}
    ]
  }'
```

Notes:
- For `o1*`/`o3*`, the proxy forces `stream=false` (aligned with the rest of this repo’s logic).

#### Embeddings
`POST /v1/embeddings`

```bash
curl http://localhost:8787/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "hello world"
  }'
```

Notes:
- If `input` is a string, the proxy normalizes it to a 1-element array.
- If `model` has the `github_copilot/` prefix, the proxy strips it before calling upstream.

#### Models
`GET /v1/models`

```bash
curl http://localhost:8787/v1/models
```

Notes:
- With token: fetches `/models` from Copilot and adds `free` (if it matches the internal “free models” list).
- Without token: returns `{ data: [], object: "list" }`.

### Anthropic-compatible

#### Messages
`POST /v1/messages`

Example (non-stream):
```bash
curl http://localhost:8787/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "max_tokens": 256,
    "messages": [
      {"role":"user","content":"Summarize this in one sentence."}
    ]
  }'
```

Notes:
- The proxy maps Anthropic Messages requests to OpenAI Responses and maps responses back.
- For `o1*`/`o3*`, the proxy forces `stream=false`.

### GitHub Device Flow helpers (for the `/` UI)
- `POST /github/get-device-code` (or `GET`): returns `device_code`, `user_code`, `verification_uri`
- `POST /github/poll-device-code`: body `{ "device_code": "..." }` to poll; returns:
  - `200` when `access_token` is available (UI auto-saves the token into KV)
  - `202` for `authorization_pending`
  - `429` for `slow_down`
  - `403` for `access_denied`
  - `410` for `expired_token`

## Quick troubleshooting
- `401 Token is invalid.`: token wasn’t saved to KV yet (open `/` to set it) or KV/`CF_*` isn’t configured.
- `kv-missing` on `/`: you’re running Node dev without `CF_API_TOKEN`/`CF_ACCOUNT_ID`/`CF_KV_NAMESPACE_ID`, or the Worker is missing the `TOKEN_KV` binding in `wrangler.json`.
- Models not showing in `/chat`: no token yet or upstream `/models` fetch failed; check the Usage/Models panels on `/`.

## Notes
- This repo uses `wrangler.json` (not `wrangler.toml`).
