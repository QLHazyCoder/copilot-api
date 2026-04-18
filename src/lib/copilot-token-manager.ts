import consola from "consola"

import { getCopilotToken } from "~/services/github/get-copilot-token"

import type { RuntimeAccountContext } from "./runtime-types"

import { runtimeContext } from "./runtime-context"
import { state } from "./state"

/**
 * Singleton manager for Copilot token with automatic refresh
 * All token access should go through this manager
 */
class CopilotTokenManager {
  private tokenStateByAccountId = new Map<
    string,
    {
      expiresAt: number
      refreshPromise: Promise<string> | null
      token?: string
    }
  >()

  /**
   * Get the current valid Copilot token
   * Automatically refreshes if expired or about to expire
   */
  async getToken(context?: RuntimeAccountContext): Promise<string> {
    const runtime = this.resolveRuntimeContext(context)
    const tokenState = this.getOrCreateTokenState(runtime.accountId)

    // If no token or token is expired/expiring soon (within 60 seconds), refresh
    const now = Date.now() / 1000
    if (!tokenState.token && state.copilotToken) {
      tokenState.token = state.copilotToken
      tokenState.expiresAt = Math.max(tokenState.expiresAt, now + 300)
    }

    if (!tokenState.token || tokenState.expiresAt - now < 60) {
      if (!tokenState.refreshPromise) {
        tokenState.refreshPromise = this.refreshToken(runtime).finally(() => {
          tokenState.refreshPromise = null
        })
      }

      await tokenState.refreshPromise
    }

    if (!tokenState.token) {
      throw new Error("Failed to obtain Copilot token")
    }

    return tokenState.token
  }

  /**
   * Force refresh the token and reset the auto-refresh timer
   */
  async refreshToken(context?: RuntimeAccountContext): Promise<string> {
    const runtime = this.resolveRuntimeContext(context)
    const tokenState = this.getOrCreateTokenState(runtime.accountId)

    try {
      consola.debug("[CopilotTokenManager] Refreshing token...")
      const { token, expires_at } = await getCopilotToken(runtime)

      tokenState.token = token
      tokenState.expiresAt = expires_at

      consola.debug("[CopilotTokenManager] Token refreshed successfully")
      if (state.showToken) {
        consola.info("[CopilotTokenManager] Token:", token)
      }
      return token
    } catch (error) {
      consola.error("[CopilotTokenManager] Failed to refresh token:", error)
      throw error
    }
  }

  /**
   * Clear the token and stop auto-refresh
   * Call this when switching accounts or logging out
   */
  clear(accountId?: string): void {
    if (accountId) {
      this.tokenStateByAccountId.delete(accountId)
      consola.debug(
        `[CopilotTokenManager] Token cleared for account ${accountId}`,
      )
      return
    }

    this.tokenStateByAccountId.clear()
    consola.debug("[CopilotTokenManager] All tokens cleared")
  }

  /**
   * Check if we have a valid token
   */
  hasValidToken(context?: RuntimeAccountContext): boolean {
    const runtime = this.resolveRuntimeContext(context)
    const tokenState = this.tokenStateByAccountId.get(runtime.accountId)
    if (!tokenState) {
      return false
    }

    const now = Date.now() / 1000
    return Boolean(tokenState.token) && tokenState.expiresAt - now > 60
  }

  getCachedToken(context?: RuntimeAccountContext): string | undefined {
    const runtime = this.resolveRuntimeContext(context)
    return this.tokenStateByAccountId.get(runtime.accountId)?.token
  }

  private getOrCreateTokenState(accountId: string): {
    expiresAt: number
    refreshPromise: Promise<string> | null
    token?: string
  } {
    let tokenState = this.tokenStateByAccountId.get(accountId)
    if (tokenState) {
      return tokenState
    }

    tokenState = {
      expiresAt: 0,
      refreshPromise: null,
    }
    this.tokenStateByAccountId.set(accountId, tokenState)
    return tokenState
  }

  private resolveRuntimeContext(
    context?: RuntimeAccountContext,
  ): RuntimeAccountContext {
    const runtime = context ?? runtimeContext.getStore()
    if (!runtime) {
      throw new Error("No runtime account context available")
    }

    return runtime
  }
}

// Export singleton instance
export const copilotTokenManager = new CopilotTokenManager()
