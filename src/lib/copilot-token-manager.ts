import consola from "consola"

import { getCopilotToken } from "~/services/github/get-copilot-token"

import { state } from "./state"

/**
 * Singleton manager for Copilot token with automatic refresh
 * All token access should go through this manager
 */
class CopilotTokenManager {
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private refreshPromise: Promise<void> | null = null
  private tokenExpiresAt: number = 0

  /**
   * Get the current valid Copilot token
   * Automatically refreshes if expired or about to expire
   */
  async getToken(): Promise<string> {
    // If no token or token is expired/expiring soon (within 60 seconds), refresh
    const now = Date.now() / 1000
    if (!state.copilotToken || this.tokenExpiresAt - now < 60) {
      if (!this.refreshPromise) {
        this.refreshPromise = this.refreshToken().finally(() => {
          this.refreshPromise = null
        })
      }

      await this.refreshPromise
    }

    if (!state.copilotToken) {
      throw new Error("Failed to obtain Copilot token")
    }

    return state.copilotToken
  }

  /**
   * Force refresh the token and reset the auto-refresh timer
   */
  async refreshToken(): Promise<void> {
    try {
      consola.debug("[CopilotTokenManager] Refreshing token...")
      const { token, expires_at, refresh_in } = await getCopilotToken()

      state.copilotToken = token
      this.tokenExpiresAt = expires_at

      consola.debug("[CopilotTokenManager] Token refreshed successfully")
      if (state.showToken) {
        consola.info("[CopilotTokenManager] Token:", token)
      }

      // Setup auto-refresh timer
      this.scheduleRefresh(refresh_in)
    } catch (error) {
      consola.error("[CopilotTokenManager] Failed to refresh token:", error)
      throw error
    }
  }

  /**
   * Schedule the next automatic refresh
   */
  private scheduleRefresh(refreshIn: number): void {
    // Clear existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }

    // Schedule refresh 60 seconds before the recommended refresh time
    const refreshMs = Math.max((refreshIn - 60) * 1000, 60000) // At least 1 minute

    consola.debug(
      `[CopilotTokenManager] Scheduling next refresh in ${Math.round(refreshMs / 1000)}s`,
    )

    this.refreshTimer = setTimeout(async () => {
      try {
        await this.refreshToken()
      } catch (error) {
        consola.error(
          "[CopilotTokenManager] Auto-refresh failed, will retry on next getToken call:",
          error,
        )
        // Clear the token so next getToken() call will trigger a refresh
        state.copilotToken = undefined
        this.tokenExpiresAt = 0
      }
    }, refreshMs)
  }

  /**
   * Clear the token and stop auto-refresh
   * Call this when switching accounts or logging out
   */
  clear(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
    this.refreshPromise = null
    state.copilotToken = undefined
    this.tokenExpiresAt = 0
    consola.debug("[CopilotTokenManager] Token cleared")
  }

  /**
   * Check if we have a valid token
   */
  hasValidToken(): boolean {
    const now = Date.now() / 1000
    return Boolean(state.copilotToken) && this.tokenExpiresAt - now > 60
  }
}

// Export singleton instance
export const copilotTokenManager = new CopilotTokenManager()
