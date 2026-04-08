import type { ModelsResponse } from "~/services/copilot/get-models"

export interface State {
  githubToken?: string
  copilotToken?: string

  accountType: string
  isDevelopment: boolean
  models?: ModelsResponse
  vsCodeVersion?: string

  rateLimitWait: boolean
  showToken: boolean

  // Rate limiting configuration
  rateLimitSeconds?: number
  lastRequestTimestamp?: number
  verbose: boolean
}

export const state: State = {
  accountType: "individual",
  isDevelopment: false,
  rateLimitWait: false,
  showToken: false,
  verbose: false,
}
