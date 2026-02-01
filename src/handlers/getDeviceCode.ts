
import {
  GITHUB_APP_SCOPES,
  GITHUB_BASE_URL,
  GITHUB_CLIENT_ID,
  standardHeaders,
} from "../configs/api-config";
import { corsHeaders, sendError } from "../response";

export async function getDeviceCode(): Promise<DeviceCodeResponse> {
  const response = await fetch(`${GITHUB_BASE_URL}/login/device/code`, {
    method: "POST",
    headers: standardHeaders(),
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: GITHUB_APP_SCOPES,
    }),
  })

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `Failed to get device code (status ${response.status})${details ? `: ${details}` : ""}`
    );
  }

  return (await response.json()) as DeviceCodeResponse
}

export async function pollDeviceToken(
  deviceCode: string
): Promise<DeviceTokenResponse> {
  const response = await fetch(`${GITHUB_BASE_URL}/login/oauth/access_token`, {
    method: "POST",
    headers: standardHeaders(),
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `Failed to exchange device code (status ${response.status})${details ? `: ${details}` : ""}`
    );
  }

  return (await response.json()) as DeviceTokenResponse;
}

export async function handleGetDeviceCode(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response(null, { status: 405, headers: corsHeaders() });
  }

  try {
    const json = await getDeviceCode();
    return new Response(JSON.stringify(json), {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return sendError(message, 502);
  }
}

export async function handlePollDeviceCode(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: corsHeaders() });
  }

  let deviceCode = "";
  try {
    const body = await request.json() as { device_code?: unknown };
    deviceCode = String(body?.device_code || "").trim();
  } catch (_) {
    deviceCode = "";
  }

  if (!deviceCode) return sendError("Missing device_code", 400);

  try {
    const tokenJson = await pollDeviceToken(deviceCode);

    // GitHub returns either `access_token` (success) or `error` (pending/denied/etc).
    if (isDeviceTokenSuccess(tokenJson)) {
      if (!tokenJson.access_token) return sendError("Empty access_token", 502);
      return new Response(JSON.stringify(tokenJson), {
        status: 200,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const error = tokenJson.error || "unknown_error";
    const status =
      error === "authorization_pending" ? 202
      : error === "slow_down" ? 429
      : error === "access_denied" ? 403
      : error === "expired_token" ? 410
      : 400;

    return new Response(JSON.stringify(tokenJson), {
      status,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return sendError(message, 502);
  }
}

export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

export type DeviceTokenResponse =
  | {
      access_token: string;
      token_type: string;
      scope: string;
    }
  | {
      error: string;
      error_description?: string;
      error_uri?: string;
      interval?: number;
    };

function isDeviceTokenSuccess(
  value: DeviceTokenResponse
): value is Extract<DeviceTokenResponse, { access_token: string }> {
  return "access_token" in value;
}
