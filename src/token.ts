import { tokenStore } from "./tokenStore";

const inFlightTokenRequests = new Map<string, Promise<string | null>>();
const KV_PREFIX = "token:";

function getKvKey(longTermToken: string): string {
  return `${KV_PREFIX}${longTermToken}`;
}

async function fetchNewToken(longTermToken: string): Promise<string | null> {
  const url = "https://api.github.com/copilot_internal/v2/token";
  const init = {
    method: "GET",
    headers: {
      "Authorization": "token " + longTermToken,
      "Editor-Plugin-Version": "copilot-chat/0.23.2",
      "Editor-Version": "vscode/1.98.0-insider",
      "User-Agent": "GitHubCopilotChat/0.23.2",
      "x-github-api-version": "2024-12-15",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-Mode": "no-cors",
      "Sec-Fetch-Dest": "empty"
    }
  };
  const existing = inFlightTokenRequests.get(longTermToken);
  if (existing) {
    return existing;
  }

  const requestPromise = (async () => {
    const resp = await fetch(url, init);
    if (resp.ok) {
      const json = await resp.json();
      if (json.token) {
        console.log("New Token:\n", json.token);
        return json.token as string;
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
    await kv.put(getKvKey(longTermToken), JSON.stringify({ tempToken: newToken, expiry: newExpiry }));
  }
  return newToken;
}

export async function getTokenFromRequest(
  request: Request,
  fallbackLongTermToken?: string,
  kv?: KVNamespace
): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  let longTermToken;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    if (fallbackLongTermToken) {
      if (!(fallbackLongTermToken.startsWith("ghu") || fallbackLongTermToken.startsWith("gho"))) {
        return null;
      }
      longTermToken = fallbackLongTermToken;
    } else if (tokenStore.size > 0) {
      const keys = Array.from(tokenStore.keys());
      longTermToken = keys[Math.floor(Math.random() * keys.length)];
      console.log("Using random longTermToken:", longTermToken);
    } else {
      return null;
    }
  } else {
    longTermToken = authHeader.substring("Bearer ".length).trim();
    if (!longTermToken) return null;
    if (!(longTermToken.startsWith("ghu") || longTermToken.startsWith("gho"))) {
      return null;
    }
  }
  return await getValidTempToken(longTermToken, kv);
}
