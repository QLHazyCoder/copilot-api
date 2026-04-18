import type { ModelsResponse } from "~/services/copilot/get-models"

export interface RuntimeAccountContext {
  accountId: string
  accountType: "individual" | "business" | "enterprise"
  githubToken: string
  login: string
  revision: number
}

export interface RuntimeModelsCacheEntry {
  fetchedAt: number
  models: ModelsResponse
}
