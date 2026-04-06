import type { FetchFunction } from "@ai-sdk/provider-utils"

import consola from "consola"

import type { SubagentMarker } from "~/routes/messages/subagent-marker"

import {
  copilotBaseUrl,
  copilotHeaders,
  prepareSubagentHeaders,
} from "~/lib/api-config"
import { getConfig } from "~/lib/config"
import { ContextOverflowError, isContextOverflow } from "~/lib/copilot-error"
import { copilotTokenManager } from "~/lib/copilot-token-manager"
import { HTTPError } from "~/lib/error"
import { state } from "~/lib/state"
import {
  appendUsageRequestLog,
  updateRequestUsageLogSummary,
} from "~/lib/usage-log-store"
import { getCopilotUsage } from "~/services/github/get-copilot-usage"

/**
 * Create a custom fetch that handles Copilot token refresh on 401/403.
 * When the initial request fails with 401/403, it clears the token,
 * gets a fresh one, and retries with the updated Authorization header.
 */
function createCopilotFetch(): FetchFunction {
  const RETRYABLE_STATUSES = new Set([401, 403])

  const copilotFetch = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    await copilotTokenManager.getToken()

    const response = await globalThis.fetch(input, init)

    if (RETRYABLE_STATUSES.has(response.status)) {
      copilotTokenManager.clear()
      await copilotTokenManager.getToken()

      // Replace Authorization header with new token
      const currentHeaders = new Headers(init?.headers)
      currentHeaders.set("Authorization", `Bearer ${state.copilotToken}`)
      return globalThis.fetch(input, {
        ...init,
        headers: Object.fromEntries(currentHeaders.entries()),
      })
    }

    return response
  }

  return copilotFetch as FetchFunction
}

function getRequestModel(body: unknown): string | undefined {
  if (!body || typeof body !== "object") {
    return undefined
  }

  const model = (body as { model?: unknown }).model
  if (typeof model !== "string" || model.length === 0) {
    return undefined
  }

  return model
}

function getRequestUsageDelta(model: string | undefined): {
  multiplier: number
  delta: number
} {
  if (!model) {
    return { multiplier: 0, delta: 0 }
  }

  const configuredMultiplier = getConfig().premiumModelMultipliers?.[model]
  const multiplier =
    (
      typeof configuredMultiplier === "number"
      && Number.isFinite(configuredMultiplier)
      && configuredMultiplier >= 0
    ) ?
      configuredMultiplier
    : 0

  return {
    multiplier,
    delta: Math.max(multiplier, 0),
  }
}

function scheduleRequestUsageSummaryRefresh(logId: string): void {
  setTimeout(async () => {
    try {
      const usage = await getCopilotUsage()
      const premium = usage.quota_snapshots.premium_interactions
      const chat = usage.quota_snapshots.chat
      const completions = usage.quota_snapshots.completions

      const premiumUsed =
        premium.unlimited ? 0 : premium.entitlement - premium.remaining
      const chatUsed = chat.unlimited ? 0 : chat.entitlement - chat.remaining
      const completionsUsed =
        completions.unlimited ? 0 : (
          completions.entitlement - completions.remaining
        )

      const usageSummaryPayload = {
        premiumUsed,
        premiumRemaining: premium.remaining,
        premiumEntitlement: premium.entitlement,
        chatUsed,
        completionsUsed,
      }

      updateRequestUsageLogSummary(logId, usageSummaryPayload)
    } catch {
      // Ignore usage summary refresh errors
    }
  }, 1000)
}

// ─── Low-level request function ──────────────────────────────────────────────

export interface CopilotRequestOptions {
  /** API path, e.g. "/chat/completions", "/responses", "/v1/messages" */
  path: string
  /** Request body (will be JSON.stringify'd). Omit for GET requests. */
  body?: unknown
  /** HTTP method, defaults to "POST" */
  method?: "GET" | "POST"
  /** Enable vision headers */
  vision?: boolean
  /** Request initiator: "agent" or "user" */
  initiator?: "agent" | "user"
  /** Subagent marker for conversation-subagent headers */
  subagentMarker?: SubagentMarker | null
  /** Session ID for x-interaction-id header */
  sessionId?: string
  /** Additional headers to merge (e.g. anthropic-beta) */
  extraHeaders?: Record<string, string>
}

/**
 * Low-level Copilot API request function.
 *
 * Combines the provider's auth/retry infrastructure with the project's
 * existing header construction. Returns a raw Response object that can
 * be consumed directly via `events(response)` for SSE or `.json()` for
 * non-streaming.
 *
 * This replaces `fetchCopilotWithRetry()` as the single entry point
 * for all Copilot API calls.
 */
export async function copilotRequest(
  options: CopilotRequestOptions,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...copilotHeaders(state, options.vision),
  }

  if (options.initiator) {
    headers["X-Initiator"] = options.initiator
  }

  prepareSubagentHeaders(
    options.sessionId,
    Boolean(options.subagentMarker),
    headers,
  )

  if (options.extraHeaders) {
    Object.assign(headers, options.extraHeaders)
  }

  const copilotFetch = createCopilotFetch()
  const url = `${copilotBaseUrl(state)}${options.path}`
  const method = options.method ?? "POST"

  const response = await copilotFetch(url, {
    method,
    headers,
    ...(options.body !== undefined && {
      body: JSON.stringify(options.body),
    }),
  })

  if (!response.ok) {
    const errorText = await response
      .clone()
      .text()
      .catch(() => "")
    if (isContextOverflow(errorText)) {
      throw new ContextOverflowError(errorText, response.status, errorText)
    }
    consola.error(`Failed to request ${options.path}`, response)
    throw new HTTPError(`Failed to request ${options.path}`, response)
  }

  if (method === "POST") {
    try {
      const model = getRequestModel(options.body)
      const usage = getRequestUsageDelta(model)
      const responseContentType = response.headers.get("content-type")
      const isStreamingResponse =
        typeof responseContentType === "string"
        && responseContentType.toLowerCase().includes("text/event-stream")
      const responseType: "streaming" | "non_streaming" =
        isStreamingResponse ? "streaming" : "non_streaming"

      const requestLogId = appendUsageRequestLog({
        accountId: getConfig().activeAccountId ?? null,
        endpoint: options.path,
        responseType,
        statusCode: response.status,
        model,
        multiplier: usage.multiplier,
        delta: usage.delta,
      })
      scheduleRequestUsageSummaryRefresh(requestLogId)
    } catch {
      // Ignore usage log persistence errors
    }
  }

  return response
}
