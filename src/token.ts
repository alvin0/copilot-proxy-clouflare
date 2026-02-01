import { GITHUB_API_BASE_URL, githubHeaders } from "./configs/api-config";
import { state as baseState } from "./types/state";
import { tokenStore } from "./types/tokenStore";
import type { KvNamespaceLike } from "./kv/kv-types";

const inFlightTokenRequests = new Map<string, Promise<string | null>>();
const KV_PREFIX = "token:";
const USER_PREFIX = "user:";
const CRED_PREFIX = "cred:";
const LONG_TERM_TOKEN_SUFFIX = "longTermToken";

const USERNAME_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PASSWORD_REGEX = /^acpc-[A-Za-z0-9]{10}$/;

function getKvKey(longTermToken: string): string {
  return `${KV_PREFIX}${longTermToken}`;
}

function getUserIndexKey(username: string): string {
  return `${USER_PREFIX}${username}`;
}

export async function listRegisteredUsers(kv?: KvNamespaceLike): Promise<string[]> {
  if (!kv?.list) return [];
  const users: string[] = [];
  let cursor: string | undefined;

  // Iterate through all `user:` index keys to discover registered users.
  // Limit is best-effort; Cloudflare may cap it anyway.
  for (let i = 0; i < 50; i++) {
    const res = await kv.list({ prefix: USER_PREFIX, limit: 1000, cursor });
    for (const key of res.keys || []) {
      if (key?.name?.startsWith(USER_PREFIX)) {
        const username = key.name.slice(USER_PREFIX.length);
        if (username) users.push(username);
      }
    }
    if (res.list_complete) break;
    cursor = res.cursor;
    if (!cursor) break;
  }

  // Stable display order.
  users.sort((a, b) => a.localeCompare(b));
  return users;
}

function buildCredentialKey(
  username: string,
  password: string,
  longTermToken: string
): string {
  return `${CRED_PREFIX}${username}:${password}:${longTermToken}`;
}

function parseCredentialKey(key: string): {
  username: string;
  password: string;
  longTermToken: string;
} | null {
  if (!key.startsWith(CRED_PREFIX)) return null;
  const raw = key.slice(CRED_PREFIX.length);
  const parts = raw.split(":");
  if (parts.length < 3) return null;
  const [username, password, ...rest] = parts;
  const longTermToken = rest.join(":");
  if (!username || !password || !longTermToken) return null;
  return { username, password, longTermToken };
}

export function isValidUsername(username: string): boolean {
  return USERNAME_REGEX.test(username);
}

export function isValidPassword(password: string): boolean {
  return PASSWORD_REGEX.test(password);
}

async function fetchNewToken(longTermToken: string): Promise<string | null> {
  const url = `${GITHUB_API_BASE_URL}/copilot_internal/v2/token`;
  const requestState = {
    ...baseState,
    githubToken: longTermToken,
    vsCodeVersion: baseState.vsCodeVersion || "1.109.0-insider"
  };
  const init = {
    method: "GET",
    headers: githubHeaders(requestState)
  };
  const existing = inFlightTokenRequests.get(longTermToken);
  if (existing) {
    return existing;
  }

  const requestPromise = (async () => {
    const resp = await fetch(url, init);
    if (resp.ok) {
    const json = await resp.json() as { token?: string };
    if (json.token) {
      console.log("New Token:\n", json.token);
      return json.token;
    }
      console.error("\"token\" field not found");
    } else {
      const errText = await resp.text();
      console.error("Request failed, status:", resp.status, errText);
    }
    return null;
  })();

  inFlightTokenRequests.set(longTermToken, requestPromise);
  try {
    return await requestPromise;
  } finally {
    inFlightTokenRequests.delete(longTermToken);
  }
}

// Extract expiry from token string.
function extractTimestamp(tokenStr: string): number {
  const parts = tokenStr.split(";");
  for (const part of parts) {
    if (part.startsWith("exp=")) {
      return parseInt(part.substring(4), 10);
    }
  }
  return 0;
}

function isTokenExpired(tokenStr: string, skewSeconds = 60): boolean {
  const exp = extractTimestamp(tokenStr);
  if (!exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return exp - now <= skewSeconds;
}

async function getValidTempToken(
  longTermToken: string,
  kv?: KvNamespaceLike
): Promise<string> {
  const record = tokenStore.get(longTermToken);
  if (record && record.tempToken && !isTokenExpired(record.tempToken)) {
    return record.tempToken;
  }

  if (kv) {
    const cached = await kv.get(getKvKey(longTermToken), "json");
    if (cached && typeof cached === "object" && "tempToken" in cached && "expiry" in cached) {
      const tempToken = String((cached as { tempToken: string }).tempToken);
      if (tempToken && !isTokenExpired(tempToken)) {
        const expiry = Number((cached as { expiry: number }).expiry) || extractTimestamp(tempToken);
        tokenStore.set(longTermToken, { tempToken, expiry });
        return tempToken;
      }
    }
  }

  const newToken = await fetchNewToken(longTermToken);
  if (!newToken) {
    throw new Error("Unable to generate new short-lived token");
  }
  const newExpiry = extractTimestamp(newToken);
  tokenStore.set(longTermToken, { tempToken: newToken, expiry: newExpiry });
  if (kv) {
    const now = Math.floor(Date.now() / 1000);
    const ttlSeconds = Math.max(60, newExpiry - now - 60);
    await kv.put(
      getKvKey(longTermToken),
      JSON.stringify({ tempToken: newToken, expiry: newExpiry }),
      { expirationTtl: ttlSeconds }
    );
  }
  return newToken;
}

export async function getStoredLongTermToken(kv?: KvNamespaceLike): Promise<string | null> {
  if (!kv) return null;
  const value = await kv.get(LONG_TERM_TOKEN_SUFFIX);
  return value ? value.trim() : null;
}

async function getUserCredentialKey(username: string, kv?: KvNamespaceLike): Promise<string | null> {
  if (!kv) return null;
  const key = await kv.get(getUserIndexKey(username));
  return key ? key.trim() : null;
}

async function getUserCredentialFromIndex(
  username: string,
  kv?: KvNamespaceLike
): Promise<{ key: string; username: string; password: string; longTermToken: string } | null> {
  const key = await getUserCredentialKey(username, kv);
  if (!key) return null;
  const parsed = parseCredentialKey(key);
  if (!parsed || parsed.username !== username) return null;
  return { key, ...parsed };
}

export async function getUserLongTermToken(
  username: string,
  kv?: KvNamespaceLike
): Promise<string | null> {
  const record = await getUserCredentialFromIndex(username, kv);
  return record ? record.longTermToken : null;
}

export async function getUserPassword(
  username: string,
  kv?: KvNamespaceLike
): Promise<string | null> {
  const record = await getUserCredentialFromIndex(username, kv);
  return record ? record.password : null;
}

export async function saveUserCredentials(
  username: string,
  password: string,
  longTermToken: string,
  kv?: KvNamespaceLike
): Promise<void> {
  if (!kv) throw new Error("KV binding is missing");
  const existingKey = await getUserCredentialKey(username, kv);
  if (existingKey) {
    await kv.delete(existingKey);
  }
  const credKey = buildCredentialKey(username, password, longTermToken);
  await kv.put(credKey, "");
  await kv.put(getUserIndexKey(username), credKey);
}

export async function deleteUserCredentials(
  username: string,
  password: string,
  kv?: KvNamespaceLike
): Promise<void> {
  if (!kv) throw new Error("KV binding is missing");
  if (!isValidUsername(username)) throw new Error("Invalid username");
  if (!isValidPassword(password)) throw new Error("Invalid password");

  const record = await getUserCredentialFromIndex(username, kv);
  if (!record) throw new Error("Unknown user");
  if (record.password !== password) throw new Error("Invalid credentials");

  // Remove the user index and credential key (also removes any cached short-lived token stored at the credential key).
  await kv.delete(getUserIndexKey(username));
  await kv.delete(record.key);
}

async function getUserTempToken(
  username: string,
  password: string,
  kv?: KvNamespaceLike
): Promise<string | null> {
  if (!kv) return null;
  if (!isValidUsername(username) || !isValidPassword(password)) return null;
  const record = await getUserCredentialFromIndex(username, kv);
  if (!record || record.password !== password) return null;

  const local = tokenStore.get(record.longTermToken);
  if (local && local.tempToken && !isTokenExpired(local.tempToken)) {
    return local.tempToken;
  }

  const cachedShort = await kv.get(record.key);
  if (cachedShort && !isTokenExpired(cachedShort)) {
    const expiry = extractTimestamp(cachedShort);
    tokenStore.set(record.longTermToken, { tempToken: cachedShort, expiry });
    return cachedShort;
  }

  const newToken = await fetchNewToken(record.longTermToken);
  if (!newToken) {
    throw new Error("Unable to generate new short-lived token");
  }
  const newExpiry = extractTimestamp(newToken);
  tokenStore.set(record.longTermToken, { tempToken: newToken, expiry: newExpiry });
  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = Math.max(60, newExpiry - now - 60);
  await kv.put(record.key, newToken, { expirationTtl: ttlSeconds });
  return newToken;
}

export async function getTokenFromRequest(
  request: Request,
  fallbackLongTermToken?: string,
  kv?: KvNamespaceLike,
  username?: string,
  password?: string
): Promise<string | null> {
  if (username && password && kv) {
    return await getUserTempToken(username, password, kv);
  }
  const envToken = fallbackLongTermToken?.trim();
  const kvToken = envToken ? null : await getStoredLongTermToken(kv);
  const longTermToken = envToken || kvToken;
  if (!longTermToken) return null;
  if (!(longTermToken.startsWith("ghu") || longTermToken.startsWith("gho"))) {
    return null;
  }
  return await getValidTempToken(longTermToken, kv);
}
