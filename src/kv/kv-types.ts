export type KvGetType = "text" | "json";

export type KvPutOptions = {
  expiration?: number;
  expirationTtl?: number;
};

export type KvPutValue = string | ArrayBuffer | ReadableStream<Uint8Array>;

export interface KvNamespaceLike {
  get(key: string): Promise<string | null>;
  get(key: string, type: "text"): Promise<string | null>;
  get<T = unknown>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: KvPutValue, options?: KvPutOptions): Promise<void>;
  delete(key: string): Promise<void>;
}
