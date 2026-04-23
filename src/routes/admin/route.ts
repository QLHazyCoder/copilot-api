/* eslint-disable max-lines */
import { Hono } from "hono"

import {
  addAccount,
  getAccountById,
  getAccounts,
  getActiveAccount,
  removeAccount,
  reorderAccounts,
  setActiveAccount,
  type Account,
} from "~/lib/accounts"
import {
  getConfig,
  getReasoningEffortForModel,
  getUsageLogCountMode,
  isValidReasoningEffort,
  isValidUsageLogCountMode,
  updateConfig,
  type ModelCardMetadata,
  type ReasoningEffort,
  type UsageLogCountMode,
} from "~/lib/config"
import { copilotTokenManager } from "~/lib/copilot-token-manager"
import { normalizeApiKeys } from "~/lib/request-auth"
import { runtimeManager } from "~/lib/runtime-manager"
import { state } from "~/lib/state"
import {
  clearAllUsageLogs,
  clearUsageLogs,
  listUsageLogEndpoints,
  listUsageLogs,
  type UsageLogCursor,
  type UsageLogSourceFilter,
} from "~/lib/usage-log-store"
import { cacheModels } from "~/lib/utils"
import {
  getCopilotUsage,
  type QuotaDetail,
} from "~/services/github/get-copilot-usage"
import { getDeviceCode } from "~/services/github/get-device-code"
import { getGitHubUser } from "~/services/github/get-user"
import { pollAccessTokenOnce } from "~/services/github/poll-access-token"

import { adminHtml } from "./html"
import { localOnlyMiddleware } from "./middleware"

export const adminRoutes = new Hono()

// Apply localhost-only middleware to all admin routes
adminRoutes.use("*", localOnlyMiddleware)

async function isKnownModel(modelId: string): Promise<boolean> {
  if (!state.models || state.models.data.length === 0) {
    try {
      await cacheModels()
    } catch {
      return false
    }
  }

  if (!state.models) {
    return false
  }

  return state.models.data.some((model) => model.id === modelId)
}

interface PremiumModelConfigSnapshot {
  multipliers: Record<string, number>
  modelCardMetadata: Record<string, ModelCardMetadata>
  hiddenModels: Array<string>
  reasoningEfforts: Record<string, ReasoningEffort>
  modelSupportedReasoningEfforts: Record<string, Array<string>>
}

interface ModelVisibilityRequestBody {
  hidden?: boolean
}

interface ModelReasoningEffortRequestBody {
  effort?: ReasoningEffort
}

interface AccountUsageSuccess {
  status: "ok"
  premiumPercent: number
  chatPercent: number
  completionsPercent: number
  premiumUnlimited: boolean
  chatUnlimited: boolean
  completionsUnlimited: boolean
}

interface AccountUsageError {
  status: "error"
}

type AccountUsage = AccountUsageSuccess | AccountUsageError

interface ReorderAccountsRequestBody {
  accountIds: Array<string>
}

interface AdminSettingsRequestBody {
  rateLimitSeconds?: number | null
  rateLimitWait?: boolean
  usageTestIntervalMinutes?: number | null
  usageLogCountMode?: UsageLogCountMode
  disableHiddenModels?: boolean
  anthropicApiKey?: string | null
  clearAnthropicApiKey?: boolean
  authApiKey?: string | null
  clearAuthApiKey?: boolean
}

const DEFAULT_USAGE_LOG_LIMIT = 50
const MAX_USAGE_LOG_LIMIT = 200

function parseUsageLogsLimit(value: string | undefined): number | null {
  if (value === undefined) {
    return DEFAULT_USAGE_LOG_LIMIT
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return null
  }

  return Math.min(MAX_USAGE_LOG_LIMIT, parsed)
}

function normalizeUsageLogSourceQuery(
  value: string | undefined,
): UsageLogSourceFilter | null {
  if (value === undefined || value === "" || value === "all") {
    return "all"
  }

  if (value === "request") {
    return "request"
  }

  return null
}

function normalizeUsageLogEndpointQuery(
  value: string | undefined,
): string | null {
  if (value === undefined || value === "") {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function decodeUsageLogsCursor(
  value: string | undefined,
): UsageLogCursor | null {
  if (!value) {
    return null
  }

  const normalized = value.replaceAll("-", "+").replaceAll("_", "/")
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")

  try {
    const decoded = Buffer.from(padded, "base64").toString("utf8")
    const parsed = JSON.parse(decoded) as {
      createdAt?: unknown
      id?: unknown
    }

    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") {
      return null
    }

    const createdAt = parsed.createdAt.trim()
    const id = parsed.id.trim()
    if (!createdAt || !id || Number.isNaN(Date.parse(createdAt))) {
      return null
    }

    return {
      createdAt,
      id,
    }
  } catch {
    return null
  }
}

function encodeUsageLogsCursor(cursor: UsageLogCursor | null): string | null {
  if (!cursor) {
    return null
  }

  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")
}

function getQuotaUsagePercent(quota: QuotaDetail): number {
  if (quota.unlimited) {
    return 100
  }

  if (Number.isFinite(quota.percent_remaining)) {
    const usedPercent = 100 - quota.percent_remaining
    return Math.min(100, Math.max(0, usedPercent))
  }

  if (quota.entitlement <= 0) {
    return 0
  }

  const used = quota.entitlement - quota.remaining
  const rawPercent = (used / quota.entitlement) * 100

  return Math.min(100, Math.max(0, rawPercent))
}

async function getAccountUsage(account: Account): Promise<AccountUsage> {
  try {
    const usage = await getCopilotUsage({ githubTokenOverride: account.token })

    return {
      status: "ok",
      premiumPercent: getQuotaUsagePercent(
        usage.quota_snapshots.premium_interactions,
      ),
      chatPercent: getQuotaUsagePercent(usage.quota_snapshots.chat),
      completionsPercent: getQuotaUsagePercent(
        usage.quota_snapshots.completions,
      ),
      premiumUnlimited: usage.quota_snapshots.premium_interactions.unlimited,
      chatUnlimited: usage.quota_snapshots.chat.unlimited,
      completionsUnlimited: usage.quota_snapshots.completions.unlimited,
    }
  } catch {
    return { status: "error" }
  }
}

function collectModelFeatures(modelSupports: unknown): Array<string> {
  if (!modelSupports || typeof modelSupports !== "object") {
    return []
  }

  const supports = modelSupports as {
    tool_calls?: boolean
    parallel_tool_calls?: boolean
    streaming?: boolean
    structured_outputs?: boolean
    vision?: boolean
    dimensions?: boolean
    max_thinking_budget?: number
    min_thinking_budget?: number
  }

  const features: Array<string> = []

  if (supports.tool_calls === true) {
    features.push("tool calls")
  }
  if (supports.parallel_tool_calls === true) {
    features.push("parallel tool calls")
  }
  if (supports.streaming === true) {
    features.push("streaming")
  }
  if (supports.structured_outputs === true) {
    features.push("structured outputs")
  }
  if (supports.vision === true) {
    features.push("vision")
  }
  if (supports.dimensions === true) {
    features.push("embeddings")
  }
  if (
    typeof supports.max_thinking_budget === "number"
    || typeof supports.min_thinking_budget === "number"
  ) {
    features.push("thinking")
  }

  return features
}

function isSameStringArray(
  left?: Array<string>,
  right?: Array<string>,
): boolean {
  if (!left && !right) {
    return true
  }

  if (!left || !right || left.length !== right.length) {
    return false
  }

  return left.every((value, index) => value === right[index])
}

function normalizeStringList(value: unknown): Array<string> {
  if (!Array.isArray(value)) {
    return []
  }

  const deduplicated = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue
    }

    const normalized = entry.trim()
    if (!normalized) {
      continue
    }

    deduplicated.add(normalized)
  }

  return Array.from(deduplicated)
}

async function ensureModelsCachedIfNeeded(): Promise<void> {
  if (!state.models || state.models.data.length === 0) {
    try {
      await cacheModels()
    } catch {
      // Continue with persisted config if model list is unavailable
    }
  }
}

function resolveModelCapabilities(model: unknown): {
  contextWindowTokens?: number
  features: Array<string>
} {
  const capabilities = (
    model as {
      capabilities?: {
        limits?: { max_context_window_tokens?: number }
        supports?: unknown
      }
    }
  ).capabilities

  const contextWindowTokens =
    typeof capabilities?.limits?.max_context_window_tokens === "number" ?
      capabilities.limits.max_context_window_tokens
    : undefined

  return {
    contextWindowTokens,
    features: collectModelFeatures(capabilities?.supports),
  }
}

function getModelMetadataIfExists(
  metadata: Record<string, ModelCardMetadata>,
  modelId: string,
): ModelCardMetadata | undefined {
  if (!Object.hasOwn(metadata, modelId)) {
    return undefined
  }

  return metadata[modelId]
}

function shouldUpdateModelMetadata(
  currentMetadata: ModelCardMetadata | undefined,
  nextMetadata: ModelCardMetadata,
): boolean {
  if (!currentMetadata) {
    return true
  }

  if (
    currentMetadata.contextWindowTokens !== nextMetadata.contextWindowTokens
  ) {
    return true
  }

  return !isSameStringArray(currentMetadata.features, nextMetadata.features)
}

function resolveNullableConfigValue<T>(
  value: T | null | undefined,
  currentValue: T | undefined,
): T | undefined {
  if (value === null) {
    return undefined
  }

  if (value !== undefined) {
    return value
  }

  return currentValue
}

function isValidPositiveNumber(value: number | undefined): boolean {
  return value === undefined || (Number.isFinite(value) && value > 0)
}

function isValidPositiveInteger(value: number | undefined): boolean {
  return (
    isValidPositiveNumber(value)
    && (value === undefined || Number.isInteger(value))
  )
}

function resolveUsageTestIntervalMinutes(
  value: number | null | undefined,
  currentValue: number | null | undefined,
): number | null | undefined {
  if (value !== undefined) {
    return value
  }

  return currentValue === undefined ? 10 : currentValue
}

function isValidUsageTestIntervalMinutes(
  value: number | null | undefined,
): boolean {
  if (value === null) {
    return true
  }

  return isValidPositiveInteger(value)
}

function resolveAnthropicApiKey(
  body: AdminSettingsRequestBody,
  currentValue: string | undefined,
): string | undefined {
  if (body.clearAnthropicApiKey === true) {
    return undefined
  }

  if (body.anthropicApiKey === undefined || body.anthropicApiKey === null) {
    return currentValue
  }

  const nextValue = body.anthropicApiKey.trim()
  return nextValue || currentValue
}

function getCurrentAuthApiKey(
  config: ReturnType<typeof getConfig>,
): string | undefined {
  const singleApiKey = config.auth?.apiKey?.trim()
  if (singleApiKey) {
    return singleApiKey
  }

  return normalizeApiKeys(config.auth?.apiKeys)[0]
}

function resolveAuthApiKey(
  body: AdminSettingsRequestBody,
  currentValue: string | undefined,
): string | undefined {
  if (body.clearAuthApiKey === true) {
    return undefined
  }

  if (body.authApiKey === undefined || body.authApiKey === null) {
    return currentValue
  }

  const nextValue = body.authApiKey.trim()
  return nextValue || currentValue
}

function syncRateLimitState(
  rateLimitSeconds: number | undefined,
  rateLimitWait: boolean,
): void {
  state.rateLimitSeconds =
    process.env.RATE_LIMIT === undefined ?
      rateLimitSeconds
    : state.rateLimitSeconds
  state.rateLimitWait =
    process.env.RATE_LIMIT_WAIT === undefined ?
      rateLimitWait
    : state.rateLimitWait
}

function buildHiddenModelDisabledValidationError(modelId: string): {
  error: { message: string; type: "validation_error" }
} {
  return {
    error: {
      message: `Hidden model is disabled by global policy: ${modelId}`,
      type: "validation_error",
    },
  }
}

function isHiddenModelBlockedByPolicy(modelId: string): boolean {
  const config = getConfig()
  if (config.disableHiddenModels !== true) {
    return false
  }

  return normalizeStringList(config.hiddenModels).includes(modelId)
}

function getModelSupportedReasoningEfforts(model: {
  capabilities?: { supports?: { reasoning_effort?: Array<string> } }
}): Array<string> {
  return model.capabilities?.supports?.reasoning_effort ?? []
}

async function getPremiumModelConfigSnapshot(): Promise<PremiumModelConfigSnapshot> {
  await ensureModelsCachedIfNeeded()

  const config = getConfig()
  const rawHiddenModels =
    Array.isArray(config.hiddenModels) ? config.hiddenModels : undefined
  const multipliers =
    config.premiumModelMultipliers ? { ...config.premiumModelMultipliers } : {}
  const modelCardMetadata: Record<string, ModelCardMetadata> =
    config.modelCardMetadata ?
      Object.fromEntries(
        Object.entries(config.modelCardMetadata).map(([modelId, metadata]) => [
          modelId,
          {
            ...(typeof metadata.contextWindowTokens === "number" && {
              contextWindowTokens: metadata.contextWindowTokens,
            }),
            ...(metadata.features && {
              features: [...metadata.features],
            }),
          } satisfies ModelCardMetadata,
        ]),
      )
    : {}
  const modelReasoningEfforts =
    config.modelReasoningEfforts ? { ...config.modelReasoningEfforts } : {}
  const normalizedHiddenModels = normalizeStringList(rawHiddenModels)
  const reasoningEfforts: Record<string, ReasoningEffort> = {}
  const modelSupportedReasoningEfforts: Record<string, Array<string>> = {}
  let hiddenModels = normalizedHiddenModels
  let changed = false

  if (!isSameStringArray(rawHiddenModels, normalizedHiddenModels)) {
    changed = true
  }

  if (state.models) {
    const knownModelIds = new Set(state.models.data.map((model) => model.id))

    hiddenModels = normalizedHiddenModels.filter((modelId) =>
      knownModelIds.has(modelId),
    )
    if (!isSameStringArray(hiddenModels, normalizedHiddenModels)) {
      changed = true
    }

    for (const model of state.models.data) {
      if (!Object.hasOwn(multipliers, model.id)) {
        multipliers[model.id] = 0
        changed = true
      }

      // 获取模型支持的推理等级列表
      const supportedEfforts = getModelSupportedReasoningEfforts(model)
      if (supportedEfforts.length > 0) {
        modelSupportedReasoningEfforts[model.id] = supportedEfforts

        // 获取配置的推理等级，如果没有则使用默认值
        const effort = getReasoningEffortForModel(model.id)
        reasoningEfforts[model.id] = effort

        if (modelReasoningEfforts[model.id] !== effort) {
          modelReasoningEfforts[model.id] = effort
          changed = true
        }
      }

      const nextMetadata: ModelCardMetadata = {
        ...resolveModelCapabilities(model),
      }

      const currentMetadata = getModelMetadataIfExists(
        modelCardMetadata,
        model.id,
      )
      if (shouldUpdateModelMetadata(currentMetadata, nextMetadata)) {
        modelCardMetadata[model.id] = nextMetadata
        changed = true
      }
    }
  }

  if (changed) {
    await updateConfig((config) => ({
      ...config,
      premiumModelMultipliers: multipliers,
      modelCardMetadata,
      hiddenModels,
      modelReasoningEfforts,
    }))
  }

  return {
    multipliers,
    modelCardMetadata,
    hiddenModels,
    reasoningEfforts,
    modelSupportedReasoningEfforts,
  }
}

// Get all accounts
adminRoutes.get("/api/accounts", async (c) => {
  const data = await getAccounts()

  // Return accounts without tokens for security
  const safeAccounts: Array<{
    id: string
    login: string
    avatarUrl: string
    accountType: "individual" | "business" | "enterprise"
    createdAt: string
    isActive: boolean
    usage: AccountUsage
  }> = []

  for (let index = 0; index < data.accounts.length; index += 5) {
    const chunk = data.accounts.slice(index, index + 5)
    const chunkSafeAccounts = await Promise.all(
      chunk.map(async (account) => ({
        id: account.id,
        login: account.login,
        avatarUrl: account.avatarUrl,
        accountType: account.accountType,
        createdAt: account.createdAt,
        isActive: account.id === data.activeAccountId,
        usage: await getAccountUsage(account),
      })),
    )

    safeAccounts.push(...chunkSafeAccounts)
  }

  return c.json({
    activeAccountId: data.activeAccountId,
    accounts: safeAccounts,
  })
})

// Get current active account
adminRoutes.get("/api/accounts/active", async (c) => {
  const account = await getActiveAccount()

  if (!account) {
    return c.json({ account: null })
  }

  return c.json({
    account: {
      id: account.id,
      login: account.login,
      avatarUrl: account.avatarUrl,
      accountType: account.accountType,
      createdAt: account.createdAt,
    },
  })
})

// Reorder accounts
adminRoutes.put("/api/accounts/reorder", async (c) => {
  const body = await c.req.json<ReorderAccountsRequestBody>()

  if (
    !Array.isArray(body.accountIds)
    || body.accountIds.some((accountId) => typeof accountId !== "string")
  ) {
    return c.json(
      {
        error: {
          message: "accountIds must be an array of strings",
          type: "validation_error",
        },
      },
      400,
    )
  }

  const reordered = await reorderAccounts(body.accountIds)
  if (!reordered) {
    return c.json(
      {
        error: {
          message: "Invalid account order",
          type: "validation_error",
        },
      },
      400,
    )
  }

  return c.json({ success: true })
})

// Switch to a different account
adminRoutes.post("/api/accounts/:id/activate", async (c) => {
  const accountId = c.req.param("id")

  const account = await getAccountById(accountId)

  if (!account) {
    return c.json(
      {
        error: {
          message: "Account not found",
          type: "not_found",
        },
      },
      404,
    )
  }

  try {
    const candidateContext = await runtimeManager.prepareAccountContext(account)
    await setActiveAccount(accountId)
    runtimeManager.commitActiveContext(candidateContext)
  } catch {
    return c.json(
      {
        error: {
          message: "Failed to prepare runtime for the selected account",
          type: "token_error",
        },
      },
      500,
    )
  }

  return c.json({
    success: true,
    account: {
      id: account.id,
      login: account.login,
      avatarUrl: account.avatarUrl,
      accountType: account.accountType,
    },
  })
})

// Delete an account
adminRoutes.delete("/api/accounts/:id", async (c) => {
  const accountId = c.req.param("id")
  const accountsData = await getAccounts()
  const isRemovingActiveAccount = accountsData.activeAccountId === accountId
  const fallbackAccount =
    isRemovingActiveAccount ?
      (accountsData.accounts.find((account) => account.id !== accountId)
      ?? null)
    : null
  let fallbackContext = null
  if (fallbackAccount) {
    try {
      fallbackContext =
        await runtimeManager.prepareAccountContext(fallbackAccount)
    } catch {
      return c.json(
        {
          error: {
            message: "Failed to prepare runtime for the fallback account",
            type: "token_error",
          },
        },
        500,
      )
    }
  }

  const removed = await removeAccount(accountId)

  if (!removed) {
    return c.json(
      {
        error: {
          message: "Account not found",
          type: "not_found",
        },
      },
      404,
    )
  }

  runtimeManager.clearAccount(accountId)

  if (fallbackContext) {
    runtimeManager.commitActiveContext(fallbackContext)
  } else if (isRemovingActiveAccount) {
    runtimeManager.clearActiveContext()
  }

  return c.json({ success: true })
})

// Initiate device code flow for adding new account
adminRoutes.post("/api/auth/device-code", async (c) => {
  try {
    const response = await getDeviceCode()

    return c.json({
      deviceCode: response.device_code,
      userCode: response.user_code,
      verificationUri: response.verification_uri,
      expiresIn: response.expires_in,
      interval: response.interval,
    })
  } catch {
    return c.json(
      {
        error: {
          message: "Failed to get device code",
          type: "auth_error",
        },
      },
      500,
    )
  }
})

interface PollRequestBody {
  deviceCode: string
  interval: number
  accountType?: string
}

type CreateAccountResult =
  | { success: true; account: Account }
  | { success: false; error: string }

/**
 * Create and save account after successful authorization
 */
async function createAccountFromToken(
  token: string,
  accountType: string,
): Promise<CreateAccountResult> {
  let user
  try {
    user = await getGitHubUser(token)
  } catch {
    return { success: false, error: "Failed to get user info" }
  }

  const resolvedAccountType =
    accountType === "business" || accountType === "enterprise" ?
      accountType
    : "individual"

  const account: Account = {
    id: user.id.toString(),
    login: user.login,
    avatarUrl: user.avatar_url,
    token,
    accountType: resolvedAccountType,
    createdAt: new Date().toISOString(),
  }

  const accountsData = await getAccounts()
  const shouldActivateAccount = !accountsData.activeAccountId
  let candidateContext = null
  if (shouldActivateAccount) {
    try {
      candidateContext = await runtimeManager.prepareAccountContext(account)
    } catch {
      return {
        success: false,
        error: "Failed to prepare runtime for the first account",
      }
    }
  }

  await addAccount(account, {
    activateIfNone: false,
  })

  if (candidateContext) {
    await setActiveAccount(account.id)
    runtimeManager.commitActiveContext(candidateContext)
  }

  return { success: true, account }
}

// Poll for access token after user authorizes

adminRoutes.post("/api/auth/poll", async (c) => {
  const body = await c.req.json<PollRequestBody>()

  if (!body.deviceCode) {
    return c.json(
      {
        error: { message: "deviceCode is required", type: "validation_error" },
      },
      400,
    )
  }

  const result = await pollAccessTokenOnce(body.deviceCode)

  if (result.status === "pending") {
    return c.json({ pending: true, message: "Waiting for user authorization" })
  }

  if (result.status === "slow_down") {
    return c.json({
      pending: true,
      slowDown: true,
      interval: result.interval,
      message: "Rate limited, please slow down",
    })
  }

  if (result.status === "expired") {
    return c.json(
      {
        error: {
          message: "Device code expired. Please start over.",
          type: "expired",
        },
      },
      400,
    )
  }

  if (result.status === "denied") {
    return c.json(
      {
        error: { message: "Authorization was denied by user.", type: "denied" },
      },
      400,
    )
  }

  if (result.status === "error") {
    return c.json({ error: { message: result.error, type: "auth_error" } }, 500)
  }

  const accountResult = await createAccountFromToken(
    result.token,
    body.accountType ?? "individual",
  )

  if (!accountResult.success) {
    return c.json(
      { error: { message: accountResult.error, type: "auth_error" } },
      500,
    )
  }

  return c.json({
    success: true,
    account: {
      id: accountResult.account.id,
      login: accountResult.account.login,
      avatarUrl: accountResult.account.avatarUrl,
      accountType: accountResult.account.accountType,
    },
  })
})

// Get current auth status
adminRoutes.get("/api/auth/status", async (c) => {
  const activeAccount = await getActiveAccount()
  const activeContext = runtimeManager.getActiveContext()

  return c.json({
    authenticated:
      activeContext ? copilotTokenManager.hasValidToken(activeContext) : false,
    hasAccounts: Boolean(activeAccount),
    activeAccount:
      activeAccount ?
        {
          id: activeAccount.id,
          login: activeAccount.login,
          avatarUrl: activeAccount.avatarUrl,
          accountType: activeAccount.accountType,
        }
      : null,
  })
})

adminRoutes.get("/api/usage-logs", (c) => {
  const limit = parseUsageLogsLimit(c.req.query("limit"))
  if (limit === null) {
    return c.json(
      {
        error: {
          message: '"limit" must be a positive integer',
          type: "validation_error",
        },
      },
      400,
    )
  }

  const source = normalizeUsageLogSourceQuery(c.req.query("source"))
  if (source === null) {
    return c.json(
      {
        error: {
          message: '"source" must be one of: all, request',
          type: "validation_error",
        },
      },
      400,
    )
  }

  const endpoint = normalizeUsageLogEndpointQuery(c.req.query("endpoint"))

  const rawCursor = c.req.query("cursor")
  const cursor = decodeUsageLogsCursor(rawCursor)
  if (rawCursor && cursor === null) {
    return c.json(
      {
        error: {
          message: '"cursor" is invalid',
          type: "validation_error",
        },
      },
      400,
    )
  }

  const activeAccountId = getConfig().activeAccountId ?? null
  const result = listUsageLogs({
    limit,
    accountId: activeAccountId,
    source,
    endpoint,
    cursor,
  })
  const endpoints = listUsageLogEndpoints({
    accountId: activeAccountId,
    source,
  })

  return c.json({
    logs: result.logs,
    pagination: {
      limit,
      hasMore: result.hasMore,
      nextCursor: encodeUsageLogsCursor(result.nextCursor),
      source,
      endpoint,
      endpoints,
    },
  })
})

adminRoutes.post("/api/usage-logs/clear", (c) => {
  const activeAccountId = getConfig().activeAccountId ?? null
  const deletedCount = clearUsageLogs(activeAccountId)

  return c.json({
    success: true,
    deletedCount,
    activeAccountId,
  })
})

adminRoutes.post("/api/usage-logs/clear-all", (c) => {
  const deletedCount = clearAllUsageLogs()

  return c.json({
    success: true,
    deletedCount,
  })
})

// Model Mapping API
adminRoutes.get("/api/model-mappings", (c) => {
  const config = getConfig()
  return c.json({ modelMapping: config.modelMapping ?? {} })
})

// Premium model multipliers API
adminRoutes.get("/api/premium-multipliers", async (c) => {
  const snapshot = await getPremiumModelConfigSnapshot()
  return c.json(snapshot)
})

adminRoutes.put("/api/premium-multipliers/:model", async (c) => {
  const modelId = c.req.param("model")
  const body = await c.req.json<{ multiplier?: number }>()

  if (
    typeof body.multiplier !== "number"
    || !Number.isFinite(body.multiplier)
    || body.multiplier < 0
  ) {
    return c.json(
      {
        error: {
          message: '"multiplier" must be a number greater than or equal to 0',
          type: "validation_error",
        },
      },
      400,
    )
  }

  if (!(await isKnownModel(modelId))) {
    return c.json(
      {
        error: {
          message: `Unknown model: ${modelId}`,
          type: "validation_error",
        },
      },
      400,
    )
  }

  const config = getConfig()
  const premiumModelMultipliers =
    config.premiumModelMultipliers ? { ...config.premiumModelMultipliers } : {}
  premiumModelMultipliers[modelId] = body.multiplier

  await updateConfig((config) => ({
    ...config,
    premiumModelMultipliers,
  }))

  return c.json({ success: true, model: modelId, multiplier: body.multiplier })
})

adminRoutes.delete("/api/premium-multipliers/:model", async (c) => {
  const modelId = c.req.param("model")

  if (!(await isKnownModel(modelId))) {
    return c.json(
      {
        error: {
          message: `Unknown model: ${modelId}`,
          type: "validation_error",
        },
      },
      400,
    )
  }

  const config = getConfig()
  const currentMultipliers =
    config.premiumModelMultipliers ? { ...config.premiumModelMultipliers } : {}
  const { [modelId]: _removed, ...premiumModelMultipliers } = currentMultipliers

  await updateConfig((config) => ({
    ...config,
    premiumModelMultipliers,
  }))

  return c.json({ success: true, model: modelId })
})

adminRoutes.put("/api/reasoning-efforts/:model", async (c) => {
  const modelId = c.req.param("model")
  const body = await c.req.json<ModelReasoningEffortRequestBody>()

  if (!(await isKnownModel(modelId))) {
    return c.json(
      {
        error: {
          message: `Unknown model: ${modelId}`,
          type: "validation_error",
        },
      },
      400,
    )
  }

  // 获取模型支持的推理等级列表
  const model = state.models?.data.find((m) => m.id === modelId)
  const supportedEfforts = model ? getModelSupportedReasoningEfforts(model) : []

  if (supportedEfforts.length === 0) {
    return c.json(
      {
        error: {
          message: `Model ${modelId} does not support reasoning effort configuration`,
          type: "validation_error",
        },
      },
      400,
    )
  }

  if (!body.effort || !isValidReasoningEffort(body.effort)) {
    return c.json(
      {
        error: {
          message: `"effort" must be a valid reasoning effort value`,
          type: "validation_error",
        },
      },
      400,
    )
  }

  // 检查模型是否支持该推理等级
  if (!supportedEfforts.includes(body.effort)) {
    return c.json(
      {
        error: {
          message: `Model ${modelId} does not support reasoning effort "${body.effort}". Supported values: ${supportedEfforts.join(", ")}`,
          type: "validation_error",
        },
      },
      400,
    )
  }

  const config = getConfig()
  const modelReasoningEfforts =
    config.modelReasoningEfforts ? { ...config.modelReasoningEfforts } : {}
  modelReasoningEfforts[modelId] = body.effort

  await updateConfig((config) => ({
    ...config,
    modelReasoningEfforts,
  }))

  return c.json({
    success: true,
    model: modelId,
    effort: body.effort,
  })
})

adminRoutes.put("/api/model-visibility/:model", async (c) => {
  const modelId = c.req.param("model")
  const body = await c.req.json<ModelVisibilityRequestBody>()

  if (typeof body.hidden !== "boolean") {
    return c.json(
      {
        error: {
          message: '"hidden" must be a boolean',
          type: "validation_error",
        },
      },
      400,
    )
  }

  if (!(await isKnownModel(modelId))) {
    return c.json(
      {
        error: {
          message: `Unknown model: ${modelId}`,
          type: "validation_error",
        },
      },
      400,
    )
  }

  const config = getConfig()
  const hiddenSet = new Set(normalizeStringList(config.hiddenModels))

  if (body.hidden) {
    hiddenSet.add(modelId)
  } else {
    hiddenSet.delete(modelId)
  }

  const hiddenModels = Array.from(hiddenSet)

  await updateConfig((config) => ({
    ...config,
    hiddenModels,
  }))

  return c.json({
    success: true,
    model: modelId,
    hidden: body.hidden,
    hiddenModels,
  })
})

adminRoutes.get("/api/settings", (c) => {
  const config = getConfig()
  const authApiKey = getCurrentAuthApiKey(config)
  const usageTestIntervalMinutes =
    config.usageTestIntervalMinutes === undefined ?
      10
    : config.usageTestIntervalMinutes

  return c.json({
    rateLimitSeconds: config.rateLimitSeconds ?? null,
    rateLimitWait: config.rateLimitWait ?? false,
    usageTestIntervalMinutes,
    usageLogCountMode: getUsageLogCountMode(),
    disableHiddenModels: config.disableHiddenModels ?? false,
    hasAnthropicApiKey: Boolean(config.anthropicApiKey?.trim()),
    hasAuthApiKey: Boolean(authApiKey),
    envOverride: {
      rateLimitSeconds: process.env.RATE_LIMIT !== undefined,
      rateLimitWait: process.env.RATE_LIMIT_WAIT !== undefined,
    },
  })
})

adminRoutes.put("/api/settings", async (c) => {
  const body = await c.req.json<AdminSettingsRequestBody>()

  const config = getConfig()

  const rateLimitSeconds = resolveNullableConfigValue(
    body.rateLimitSeconds,
    config.rateLimitSeconds,
  )

  if (!isValidPositiveNumber(rateLimitSeconds)) {
    return c.json(
      {
        error: {
          message: '"rateLimitSeconds" must be a number greater than 0',
          type: "validation_error",
        },
      },
      400,
    )
  }

  const rateLimitWait = body.rateLimitWait ?? config.rateLimitWait ?? false
  const disableHiddenModels =
    body.disableHiddenModels ?? config.disableHiddenModels ?? false

  const usageTestIntervalMinutes = resolveUsageTestIntervalMinutes(
    body.usageTestIntervalMinutes,
    config.usageTestIntervalMinutes,
  )

  if (!isValidUsageTestIntervalMinutes(usageTestIntervalMinutes)) {
    return c.json(
      {
        error: {
          message:
            '"usageTestIntervalMinutes" must be an integer greater than 0',
          type: "validation_error",
        },
      },
      400,
    )
  }

  if (
    body.usageLogCountMode !== undefined
    && !isValidUsageLogCountMode(body.usageLogCountMode)
  ) {
    return c.json(
      {
        error: {
          message:
            '"usageLogCountMode" must be either "request" or "conversation"',
          type: "validation_error",
        },
      },
      400,
    )
  }

  const anthropicApiKey = resolveAnthropicApiKey(
    body,
    config.anthropicApiKey?.trim() || undefined,
  )
  const authApiKey = resolveAuthApiKey(body, getCurrentAuthApiKey(config))

  const usageLogCountMode = body.usageLogCountMode ?? getUsageLogCountMode()

  await updateConfig((config) => ({
    ...config,
    auth: {
      ...config.auth,
      apiKey: authApiKey,
      apiKeys: authApiKey ? [authApiKey] : [],
    },
    rateLimitSeconds,
    rateLimitWait,
    usageTestIntervalMinutes,
    usageLogCountMode,
    disableHiddenModels,
    anthropicApiKey,
  }))

  syncRateLimitState(rateLimitSeconds, rateLimitWait)

  return c.json({
    success: true,
    settings: {
      rateLimitSeconds: rateLimitSeconds ?? null,
      rateLimitWait,
      usageTestIntervalMinutes: usageTestIntervalMinutes ?? null,
      usageLogCountMode,
      disableHiddenModels,
      hasAnthropicApiKey: Boolean(anthropicApiKey),
      hasAuthApiKey: Boolean(authApiKey),
    },
  })
})

adminRoutes.get("/api/models", async (c) => {
  try {
    if (!state.models) {
      await cacheModels()
    }

    const models = state.models?.data.map((model) => ({
      id: model.id,
      object: "model",
      type: "model",
      created: 0,
      created_at: new Date(0).toISOString(),
      owned_by: model.vendor,
      display_name: model.name,
    }))

    return c.json({
      object: "list",
      data: models,
      has_more: false,
    })
  } catch (error) {
    return c.json(
      {
        error: {
          message: `Failed to load models: ${String(error)}`,
          type: "server_error",
        },
      },
      500,
    )
  }
})

adminRoutes.get("/api/usage-summary", async (c) => {
  try {
    const usage = await getCopilotUsage()
    return c.json(usage)
  } catch (error) {
    return c.json(
      {
        error: {
          message: `Failed to fetch usage summary: ${String(error)}`,
          type: "server_error",
        },
      },
      500,
    )
  }
})

adminRoutes.put("/api/model-mappings/:from", async (c) => {
  const from = c.req.param("from")
  const body = await c.req.json<{ to: string }>()

  if (!body.to || typeof body.to !== "string") {
    return c.json(
      {
        error: { message: '"to" field is required', type: "validation_error" },
      },
      400,
    )
  }

  if (isHiddenModelBlockedByPolicy(body.to)) {
    return c.json(buildHiddenModelDisabledValidationError(body.to), 400)
  }

  const config = getConfig()
  const modelMapping = { ...config.modelMapping, [from]: body.to }
  await updateConfig((config) => ({
    ...config,
    modelMapping,
  }))
  return c.json({ success: true, from, to: body.to })
})

adminRoutes.delete("/api/model-mappings/:from", async (c) => {
  const from = c.req.param("from")
  const config = getConfig()

  if (!config.modelMapping || !(from in config.modelMapping)) {
    return c.json(
      { error: { message: "Mapping not found", type: "not_found" } },
      404,
    )
  }

  const { [from]: _removed, ...rest } = config.modelMapping
  await updateConfig((config) => ({
    ...config,
    modelMapping: rest,
  }))
  return c.json({ success: true })
})

// Serve static HTML for admin UI
adminRoutes.get("/", (c) => {
  return c.html(adminHtml)
})
