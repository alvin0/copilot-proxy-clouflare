import { GITHUB_API_BASE_URL, githubHeaders } from "./configs/api-config";
import { tokenStore } from "./types/tokenStore";
import { state as baseState } from "./types/state";

const inFlightTokenRequests = new Map<string, Promise<string | null>>();
const KV_PREFIX = "token:";
const LONG_TERM_TOKEN_KEY = "longTermToken";

function getKvKey(longTermToken: string): string {
  return `${KV_PREFIX}${longTermToken}`;
}

async function fetchNewToken(longTermToken: string): Promise<string | null> {
  const url = `${GITHUB_API_BASE_URL}/copilot_internal/v2/token`;
  const requestState = {
    ...baseState,
    githubToken: longTermToken,
    vsCodeVersion: baseState.vsCodeVersion || "1.98.0-insider"
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
  kv?: KVNamespace
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

export async function getStoredLongTermToken(kv?: KVNamespace): Promise<string | null> {
  if (!kv) return null;
  const value = await kv.get(LONG_TERM_TOKEN_KEY);
  return value ? value.trim() : null;
}

export async function getTokenFromRequest(
  request: Request,
  fallbackLongTermToken?: string,
  kv?: KVNamespace
): Promise<string | null> {
  const envToken = fallbackLongTermToken?.trim();
  const kvToken = envToken ? null : await getStoredLongTermToken(kv);
  const longTermToken = envToken || kvToken;
  if (!longTermToken) return null;
  if (!(longTermToken.startsWith("ghu") || longTermToken.startsWith("gho"))) {
    return null;
  }
  return await getValidTempToken(longTermToken, kv);
}
