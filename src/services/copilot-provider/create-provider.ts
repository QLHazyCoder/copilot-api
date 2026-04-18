import type { FetchFunction } from "@ai-sdk/provider-utils"

import consola from "consola"

import type { RuntimeAccountContext } from "~/lib/runtime-types"
import type { SubagentMarker } from "~/routes/messages/subagent-marker"

import {
  copilotBaseUrl,
  copilotHeaders,
  prepareSubagentHeaders,
} from "~/lib/api-config"
import { getConfig, getUsageLogCountMode } from "~/lib/config"
import { ContextOverflowError, isContextOverflow } from "~/lib/copilot-error"
import { copilotTokenManager } from "~/lib/copilot-token-manager"
import { HTTPError } from "~/lib/error"
import { createHandlerLogger } from "~/lib/logger"
import { runtimeContext } from "~/lib/runtime-context"
import { state } from "~/lib/state"
import {
  appendUsageRequestLog,
  updateRequestUsageLogSummary,
} from "~/lib/usage-log-store"
import { getCopilotUsage } from "~/services/github/get-copilot-usage"

const usageLogger = createHandlerLogger("usage-log")

/**
 * Create a custom fetch that handles Copilot token refresh on 401/403.
 * When the initial request fails with 401/403, it clears the token,
 * gets a fresh one, and retries with the updated Authorization header.
 */
function createCopilotFetch(runtime: RuntimeAccountContext): FetchFunction {
  const RETRYABLE_STATUSES = new Set([401, 403])

  const copilotFetch = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const response = await globalThis.fetch(input, init)

    if (RETRYABLE_STATUSES.has(response.status)) {
      copilotTokenManager.clear(runtime.accountId)
      const refreshedToken = await copilotTokenManager.getToken(runtime)

      // Replace Authorization header with new token
      const currentHeaders = new Headers(init?.headers)
      currentHeaders.set("Authorization", `Bearer ${refreshedToken}`)
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

function resolveRequestRuntime(): RuntimeAccountContext | null {
  const runtime = runtimeContext.getStore()
  if (runtime) {
    return runtime
  }

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

function scheduleRequestUsageSummaryRefresh(
  logId: string,
  runtime: RuntimeAccountContext | null,
): void {
  setTimeout(async () => {
    try {
      const usage = await getCopilotUsage({
        githubTokenOverride: runtime?.githubToken,
      })
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
  /** Skip local usage log persistence for internal system requests */
  skipUsageLog?: boolean
  /** Additional headers to merge (e.g. anthropic-beta) */
  extraHeaders?: Record<string, string>
}

function buildCopilotRequestHeaders(
  options: CopilotRequestOptions,
  copilotToken: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    ...copilotHeaders(copilotToken, options.vision),
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

  return headers
}

async function throwRequestError(
  options: CopilotRequestOptions,
  response: Response,
): Promise<never> {
  const errorText = await response
    .clone()
    .text()
    .catch(() => "")
  if (isContextOverflow(errorText)) {
    throw new ContextOverflowError(errorText, {
      statusCode: response.status,
      responseBody: errorText,
    })
  }
  consola.error(`Failed to request ${options.path}`, response)
  throw new HTTPError(`Failed to request ${options.path}`, response)
}

function getResponseType(response: Response): "streaming" | "non_streaming" {
  const responseContentType = response.headers.get("content-type")
  const isStreamingResponse =
    typeof responseContentType === "string"
    && responseContentType.toLowerCase().includes("text/event-stream")

  return isStreamingResponse ? "streaming" : "non_streaming"
}

function logConversationUsageDecision({
  options,
  model,
  multiplier,
  response,
  responseType,
  requestLog,
}: {
  options: CopilotRequestOptions
  model: string | undefined
  multiplier: number
  response: Response
  responseType: "streaming" | "non_streaming"
  requestLog: ReturnType<typeof appendUsageRequestLog>
}): void {
  if (!state.isDevelopment) {
    return
  }

  usageLogger.info("Usage log decision for conversation-mode request:", {
    path: options.path,
    model: model ?? null,
    responseType,
    statusCode: response.status,
    multiplier,
    requestedConversationId: options.sessionId ?? null,
    effectiveConversationId: requestLog.conversationId,
    conversationVariantKey: requestLog.conversationVariantKey,
    effectiveCountMode: requestLog.effectiveCountMode,
    inserted: requestLog.inserted,
    reason: requestLog.reason,
    logId: requestLog.logId,
  })

  usageLogger.info("Scheduled usage summary refresh for conversation log:", {
    logId: requestLog.logId,
    path: options.path,
    reason: requestLog.reason,
  })
}

function persistUsageLogForPostRequest(
  options: CopilotRequestOptions,
  response: Response,
): void {
  try {
    const runtime = resolveRequestRuntime()
    const model = getRequestModel(options.body)
    const usage = getRequestUsageDelta(model)
    const countMode = getUsageLogCountMode()
    const responseType = getResponseType(response)
    const requestLog = appendUsageRequestLog({
      accountId: runtime?.accountId ?? null,
      endpoint: options.path,
      responseType,
      statusCode: response.status,
      model,
      multiplier: usage.multiplier,
      delta: usage.delta,
      countMode,
      conversationId: options.sessionId ?? null,
    })

    if (countMode === "conversation") {
      logConversationUsageDecision({
        options,
        model,
        multiplier: usage.multiplier,
        response,
        responseType,
        requestLog,
      })
    }

    scheduleRequestUsageSummaryRefresh(requestLog.logId, runtime)
  } catch {
    // Ignore usage log persistence errors
  }
}

function logSkippedUsageLog(options: CopilotRequestOptions): void {
  if (!state.isDevelopment) {
    return
  }

  usageLogger.info("Skipped local usage log for internal request:", {
    path: options.path,
    model: getRequestModel(options.body) ?? null,
    sessionId: options.sessionId ?? null,
  })
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
  const runtime = resolveRequestRuntime()
  if (!runtime) {
    throw new Error("No runtime account context available for Copilot request")
  }

  const token = await copilotTokenManager.getToken(runtime)
  const headers = buildCopilotRequestHeaders(options, token)
  const copilotFetch = createCopilotFetch(runtime)
  const url = `${copilotBaseUrl(runtime)}${options.path}`
  const method = options.method ?? "POST"

  const response = await copilotFetch(url, {
    method,
    headers,
    ...(options.body !== undefined && {
      body: JSON.stringify(options.body),
    }),
  })

  if (!response.ok) {
    await throwRequestError(options, response)
  }

  if (method === "POST" && !options.skipUsageLog) {
    persistUsageLogForPostRequest(options, response)
  } else if (method === "POST" && options.skipUsageLog) {
    logSkippedUsageLog(options)
  }

  return response
}
