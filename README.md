# copilot-proxy-clouflare

A Cloudflare Worker proxy for GitHub Copilot-compatible endpoints, now routed with Hono.

## Features
- `/v1/chat/completions` (streaming supported)
- `/v1/embeddings`
- `/v1/models` (uses static list when no auth header is provided)
- Automatic short-lived Copilot token refresh

## Requirements
- Node.js (for installing dependencies)
- A Cloudflare Worker runtime (e.g. Wrangler) or any platform that supports the standard Fetch API

## Setup
```bash
npm install
```

If you use Wrangler, point your entry to `src/index.ts`.

## Cloudflare Deploy (Wrangler)
`wrangler.json` is included and points to `src/index.ts`.

1) Login to Cloudflare:
```bash
npx wrangler login
```

2) Create KV namespaces (pick one option):
- CLI:
  ```bash
  npx wrangler kv namespace create TOKEN_KV
  npx wrangler kv namespace create TOKEN_KV_preview --preview
  ```
- Dashboard: Workers & Pages → KV → Create namespace.

3) Update `wrangler.json` with the returned `id` and `preview_id`.

4) Set the Worker secret:
```bash
npx wrangler secret put LONG_TERM_TOKEN
```

5) Deploy:
```bash
npm run deploy
```

## Run (Node.js)
```bash
npm run dev
```

## Run (Cloudflare Wrangler)
```bash
npm run dev:cf
```

## GitHub Actions CI/CD
This repo includes `.github/workflows/deploy.yml` to auto-deploy on push to `main`.

Required GitHub secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `LONG_TERM_TOKEN`

The workflow auto-creates the KV namespace (if missing) and injects the IDs into `wrangler.json` during deploy.
It expects an Environment named `CLOUDFLARE_API_TOKEN` with those secrets.

## Authentication
Requests no longer require an `Authorization` header. The service uses the
`LONG_TERM_TOKEN` Worker secret (or `.env` for local dev) as the single source
of truth.

## Endpoints

### Chat Completions
`POST /v1/chat/completions`

```bash
curl -X POST http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "stream": true,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

Notes:
- For `o1`/`o3` models, the upstream request is non-streaming and the response is wrapped as SSE.

### Embeddings
`POST /v1/embeddings`

```bash
curl -X POST http://localhost:8787/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "hello world"
  }'
```

### Models
`GET /v1/models`

```bash
curl http://localhost:8787/v1/models
```

## Notes
- This project uses `wrangler.json` instead of `wrangler.toml`.
