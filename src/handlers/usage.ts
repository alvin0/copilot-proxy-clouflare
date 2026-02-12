
import { GITHUB_API_BASE_URL, githubHeaders } from "../configs/api-config";
import { CopilotUsageResponse } from "../types/get-usage";
import { state as baseState } from "../types/state";

const DEFAULT_VSCODE_VERSION = "1.109.2";

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
