import type { ModelsResponse } from "~/services/copilot/get-models"

import { getModels } from "~/services/copilot/get-models"

import type { Account } from "./accounts"
import type {
  RuntimeAccountContext,
  RuntimeModelsCacheEntry,
} from "./runtime-types"

import { getConfig } from "./config"
import { copilotTokenManager } from "./copilot-token-manager"
import { runtimeContext } from "./runtime-context"
import { state } from "./state"

class RuntimeManager {
  private activeContext: RuntimeAccountContext | null = null
  private modelsCache = new Map<string, RuntimeModelsCacheEntry>()
  private modelsInFlight = new Map<string, Promise<ModelsResponse>>()
  private revision = 0

  async initialize(
    account: Account | null,
  ): Promise<RuntimeAccountContext | null> {
    if (!account) {
      this.clearActiveContext()
      return null
    }

    const candidateContext = await this.prepareAccountContext(account)
    this.commitActiveContext(candidateContext)
    return candidateContext
  }

  getActiveContext(): RuntimeAccountContext | null {
    return this.activeContext
  }

  getCurrentContext(): RuntimeAccountContext | null {
    return (
      runtimeContext.getStore() ?? this.activeContext ?? this.getLegacyContext()
    )
  }

  requireCurrentContext(): RuntimeAccountContext {
    const currentContext = this.getCurrentContext()
    if (!currentContext) {
      throw new Error("No active runtime account configured")
    }

    return currentContext
  }

  async prepareAccountContext(
    account: Account,
  ): Promise<RuntimeAccountContext> {
    const candidateContext: RuntimeAccountContext = {
      accountId: account.id,
      accountType: account.accountType,
      githubToken: account.token,
      login: account.login,
      revision: this.revision + 1,
    }

    await runtimeContext.run(candidateContext, async () => {
      await copilotTokenManager.getToken(candidateContext)
      await this.refreshModelsForContext(candidateContext, true)
    })

    return candidateContext
  }

  commitActiveContext(context: RuntimeAccountContext): void {
    const previousContext = this.activeContext
    this.revision += 1
    this.activeContext = {
      ...context,
      revision: this.revision,
    }

    const activeModels = this.getCachedModels(this.activeContext.accountId)
    state.githubToken = this.activeContext.githubToken
    state.accountType = this.activeContext.accountType
    state.models = activeModels

    if (
      previousContext
      && previousContext.accountId !== this.activeContext.accountId
    ) {
      copilotTokenManager.clear(previousContext.accountId)
    }
  }

  clearActiveContext(): void {
    const previousContext = this.activeContext
    this.activeContext = null
    state.githubToken = undefined
    state.accountType = "individual"
    state.models = undefined

    if (previousContext) {
      copilotTokenManager.clear(previousContext.accountId)
    }
  }

  getCurrentModels(): ModelsResponse | undefined {
    const currentContext = this.getCurrentContext()
    if (!currentContext) {
      return state.models
    }

    return this.getCachedModels(currentContext.accountId) ?? state.models
  }

  getActiveModels(): ModelsResponse | undefined {
    if (this.activeContext) {
      return this.getCachedModels(this.activeContext.accountId)
    }

    return state.models
  }

  async refreshModelsForCurrentContext(
    forceRefresh: boolean = false,
  ): Promise<ModelsResponse> {
    const currentContext = this.requireCurrentContext()
    return await this.refreshModelsForContext(currentContext, forceRefresh)
  }

  async refreshModelsForContext(
    context: RuntimeAccountContext,
    forceRefresh: boolean = false,
  ): Promise<ModelsResponse> {
    if (!forceRefresh) {
      const cachedModels = this.getCachedModels(context.accountId)
      if (cachedModels) {
        return cachedModels
      }
    }

    const existingRequest = this.modelsInFlight.get(context.accountId)
    if (existingRequest) {
      return await existingRequest
    }

    const refreshPromise = runtimeContext.run(context, async () => {
      const models = await getModels()
      this.modelsCache.set(context.accountId, {
        fetchedAt: Date.now(),
        models,
      })

      if (this.activeContext?.accountId === context.accountId) {
        state.models = models
      }

      return models
    })

    this.modelsInFlight.set(context.accountId, refreshPromise)

    try {
      return await refreshPromise
    } finally {
      this.modelsInFlight.delete(context.accountId)
    }
  }

  clearAccount(accountId: string): void {
    this.modelsCache.delete(accountId)
    this.modelsInFlight.delete(accountId)
    copilotTokenManager.clear(accountId)

    if (this.activeContext?.accountId === accountId) {
      this.clearActiveContext()
    }
  }

  private getCachedModels(accountId: string): ModelsResponse | undefined {
    return this.modelsCache.get(accountId)?.models
  }

  private getLegacyContext(): RuntimeAccountContext | null {
    if (!state.githubToken) {
      return null
    }

    return {
      accountId: getConfig().activeAccountId ?? "__legacy__",
      accountType:
        state.accountType === "business" || state.accountType === "enterprise" ?
          state.accountType
        : "individual",
      githubToken: state.githubToken,
      login: "legacy",
      revision: 0,
    }
  }
}

export const runtimeManager = new RuntimeManager()
