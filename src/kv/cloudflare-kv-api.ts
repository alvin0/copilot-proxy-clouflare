import type { KvGetType, KvListOptions, KvListResult, KvNamespaceLike, KvPutOptions, KvPutValue } from "./kv-types";

export type CloudflareKvApiConfig = {
  accountId: string;
  namespaceId: string;
  apiToken: string;
  baseUrl?: string;
};

function buildValuesUrl(config: CloudflareKvApiConfig, key: string, options?: KvPutOptions): string {
  const baseUrl = (config.baseUrl || "https://api.cloudflare.com").replace(/\/+$/, "");
  const encodedKey = encodeURIComponent(key);
  const url = new URL(
    `${baseUrl}/client/v4/accounts/${config.accountId}/storage/kv/namespaces/${config.namespaceId}/values/${encodedKey}`
  );
  if (options?.expirationTtl != null) url.searchParams.set("expiration_ttl", String(options.expirationTtl));
  if (options?.expiration != null) url.searchParams.set("expiration", String(options.expiration));
  return url.toString();
}

function buildKeysUrl(config: CloudflareKvApiConfig, options?: KvListOptions): string {
  const baseUrl = (config.baseUrl || "https://api.cloudflare.com").replace(/\/+$/, "");
  const url = new URL(
    `${baseUrl}/client/v4/accounts/${config.accountId}/storage/kv/namespaces/${config.namespaceId}/keys`
  );
  if (options?.prefix) url.searchParams.set("prefix", options.prefix);
  if (options?.limit != null) url.searchParams.set("limit", String(options.limit));
  if (options?.cursor) url.searchParams.set("cursor", options.cursor);
  return url.toString();
}

async function kvApiFetch(
  config: CloudflareKvApiConfig,
  init: RequestInit & { key: string; options?: KvPutOptions }
): Promise<Response> {
  const url = buildValuesUrl(config, init.key, init.options);
  return await fetch(url, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      ...(init.headers || {})
    },
    body: init.body
  });
}

export function createCloudflareKvApi(config: CloudflareKvApiConfig): KvNamespaceLike {
  return {
    async get<T = unknown>(key: string, type?: KvGetType): Promise<T | string | null> {
      const resp = await kvApiFetch(config, { method: "GET", key });
      if (resp.status === 404) return null;
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Cloudflare KV API get failed (${resp.status}): ${text || resp.statusText}`);
      }

      if (type === "json") {
        const text = await resp.text();
        if (!text) return null;
        return JSON.parse(text) as T;
      }

      return await resp.text();
    },

    async put(key: string, value: KvPutValue, options?: KvPutOptions): Promise<void> {
      const isString = typeof value === "string";
      const resp = await kvApiFetch(config, {
        method: "PUT",
        key,
        options,
        headers: isString ? { "Content-Type": "text/plain; charset=utf-8" } : undefined,
        body: value
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Cloudflare KV API put failed (${resp.status}): ${text || resp.statusText}`);
      }
    },

    async delete(key: string): Promise<void> {
      const resp = await kvApiFetch(config, { method: "DELETE", key });
      if (resp.status === 404) return;
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Cloudflare KV API delete failed (${resp.status}): ${text || resp.statusText}`);
      }
    },

    async list(options?: KvListOptions): Promise<KvListResult> {
      const url = buildKeysUrl(config, options);
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.apiToken}`
        }
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Cloudflare KV API list failed (${resp.status}): ${text || resp.statusText}`);
      }
      const json = await resp.json() as {
        success?: boolean;
        result?: KvListResult;
        errors?: unknown;
      };
      if (!json || json.success !== true || !json.result) {
        throw new Error(`Cloudflare KV API list returned unexpected response`);
      }
      return json.result;
    }
  };
}

export function createCloudflareKvApiFromEnv(env: Record<string, string | undefined>): KvNamespaceLike | undefined {
  const apiToken = env.CF_API_TOKEN?.trim() || "";
  const accountId = env.CF_ACCOUNT_ID?.trim() || "";
  const namespaceId = env.CF_KV_NAMESPACE_ID?.trim() || "";
  const baseUrl = env.CF_API_BASE_URL?.trim() || "";

  if (!apiToken || !accountId || !namespaceId) return undefined;

  return createCloudflareKvApi({
    apiToken,
    accountId,
    namespaceId,
    baseUrl: baseUrl || undefined
  });
}
