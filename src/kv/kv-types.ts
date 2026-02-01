export type KvGetType = "text" | "json";

export type KvPutOptions = {
  expiration?: number;
  expirationTtl?: number;
};

export type KvPutValue = string | ArrayBuffer | ReadableStream<Uint8Array>;

export type KvListOptions = {
  prefix?: string;
  limit?: number;
  cursor?: string;
};

export type KvListedKey = {
  name: string;
  expiration?: number;
};

export type KvListResult = {
  keys: KvListedKey[];
  list_complete: boolean;
  cursor?: string;
};

export interface KvNamespaceLike {
  get(key: string): Promise<string | null>;
  get(key: string, type: "text"): Promise<string | null>;
  get<T = unknown>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: KvPutValue, options?: KvPutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  // Optional: Workers KV supports list(); Node dev may implement via Cloudflare KV REST API.
  list?(options?: KvListOptions): Promise<KvListResult>;
}
