import {
  editor_plugin_version,
  editor_version,
  openai_organization,
  user_agent,
  x_github_api_version
} from "./constants";
import { generateRandomHex, generateUUID, randomRequestId } from "./utils/ids";

export function getModelHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Connection": "keep-alive",
    "openai-intent": "model-access",
    "Editor-Plugin-Version": editor_plugin_version,
    "Editor-Version": editor_version,
    "Openai-Organization": openai_organization,
    "User-Agent": user_agent,
    "VScode-MachineId": generateRandomHex(64),
    "VScode-SessionId": generateUUID(),
    "accept": "*/*",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Dest": "empty",
    "accept-encoding": "gzip, deflate, br, zstd",
    "X-GitHub-Api-Version": x_github_api_version,
    "X-Request-Id": randomRequestId(),
    "copilot-integration-id": "vscode-chat",
    "Copilot-Vision-Request": "true",
    "Authorization": "Bearer " + token
  };
}

export function getEmbeddingsHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Connection": "keep-alive",
    "Editor-Plugin-Version": editor_plugin_version,
    "Editor-Version": editor_version,
    "Openai-Organization": openai_organization,
    "User-Agent": user_agent,
    "VScode-MachineId": generateRandomHex(64),
    "VScode-SessionId": generateUUID(),
    "accept": "*/*",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Dest": "empty",
    "accept-encoding": "gzip, deflate, br, zstd",
    "X-GitHub-Api-Version": x_github_api_version,
    "X-Request-Id": randomRequestId(),
    "Copilot-Vision-Request": "true",
    "Authorization": "Bearer " + token
  };
}

export function getCompletionsHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Connection": "keep-alive",
    "copilot-vision-request": "true",
    "openai-intent": "conversation-panel",
    "Editor-Plugin-Version": editor_plugin_version,
    "Editor-Version": editor_version,
    "Openai-Organization": openai_organization,
    "User-Agent": user_agent,
    "VScode-MachineId": generateRandomHex(64),
    "VScode-SessionId": generateUUID(),
    "accept": "*/*",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Dest": "empty",
    "accept-encoding": "gzip, deflate, br, zstd",
    "X-GitHub-Api-Version": x_github_api_version,
    "X-Request-Id": randomRequestId(),
    "copilot-integration-id": "vscode-chat",
    "Copilot-Vision-Request": "true",
    "Authorization": "Bearer " + token
  };
}
