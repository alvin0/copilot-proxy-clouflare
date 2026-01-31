export interface State {
  githubToken?: string
  copilotToken?: string

  accountType: string
  models?: any
  vsCodeVersion?: string

  manualApprove: boolean
  rateLimitWait: boolean
  showToken: boolean

  // Rate limiting configuration
  rateLimitSeconds?: number
  lastRequestTimestamp?: number
}

export const state: State = {
  accountType: "individual",
  manualApprove: false,
  rateLimitWait: false,
  showToken: false,
}
