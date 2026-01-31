
import { GITHUB_API_BASE_URL, githubHeaders } from "../configs/api-config";
import { state as baseState } from "../configs/state";

const DEFAULT_VSCODE_VERSION = "1.98.0-insider";

export const getCopilotUsage = async (
  githubToken: string,
  vsCodeVersion: string = DEFAULT_VSCODE_VERSION
): Promise<CopilotUsageResponse> => {
  const requestState = {
    ...baseState,
    githubToken,
    vsCodeVersion
  };

  const response = await fetch(`${GITHUB_API_BASE_URL}/copilot_internal/user`, {
    headers: githubHeaders(requestState)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get Copilot usage: ${response.status} ${text}`);
  }

  return (await response.json()) as CopilotUsageResponse;
};

export interface QuotaDetail {
  entitlement: number
  overage_count: number
  overage_permitted: boolean
  percent_remaining: number
  quota_id: string
  quota_remaining: number
  remaining: number
  unlimited: boolean
}

interface QuotaSnapshots {
  chat: QuotaDetail
  completions: QuotaDetail
  premium_interactions: QuotaDetail
}

interface CopilotUsageResponse {
  access_type_sku: string
  analytics_tracking_id: string
  assigned_date: string
  can_signup_for_limited: boolean
  chat_enabled: boolean
  copilot_plan: string
  organization_login_list: Array<unknown>
  organization_list: Array<unknown>
  quota_reset_date: string
  quota_snapshots: QuotaSnapshots
}
