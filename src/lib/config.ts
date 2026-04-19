import consola from "consola"
import fs from "node:fs"
import path from "node:path"

import { PATHS } from "./paths"

export interface AccountConfig {
  id: string
  login: string
  avatarUrl: string
  token: string
  accountType: "individual" | "business" | "enterprise"
  createdAt: string
}

export interface ModelCardMetadata {
  contextWindowTokens?: number
  features?: Array<string>
}

export type ReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"

export type UsageLogCountMode = "request" | "conversation"

export interface AuthConfig {
  apiKey?: string
  apiKeys?: Array<string>
}

export interface AppConfig {
  auth?: AuthConfig
  extraPrompts?: Record<string, string>
  smallModel?: string
  modelReasoningEfforts?: Record<string, ReasoningEffort>
  modelMapping?: Record<string, string>
  premiumModelMultipliers?: Record<string, number>
  modelCardMetadata?: Record<string, ModelCardMetadata>
  hiddenModels?: Array<string>
  useFunctionApplyPatch?: boolean
  anthropicApiKey?: string
  rateLimitSeconds?: number
  rateLimitWait?: boolean
  usageTestIntervalMinutes?: number | null
  usageLogCountMode?: UsageLogCountMode
  // Account management
  accounts?: Array<AccountConfig>
  activeAccountId?: string | null
}

export type ReadonlyAppConfig = DeepReadonly<AppConfig>

type DeepReadonly<T> =
  T extends Array<infer U> ? ReadonlyArray<DeepReadonly<U>>
  : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T

const gpt5ExplorationPrompt = `## Exploration and reading files
- **Think first.** Before any tool call, decide ALL files/resources you will need.
- **Batch everything.** If you need multiple files (even from different places), read them together.
- **multi_tool_use.parallel** Use multi_tool_use.parallel to parallelize tool calls and only this.
- **Only make sequential calls if you truly cannot know the next file without seeing a result first.**
- **Workflow:** (a) plan all needed reads → (b) issue one parallel batch → (c) analyze results → (d) repeat if new, unpredictable reads arise.`

const defaultConfig: AppConfig = {
  auth: {},
  extraPrompts: {
    "gpt-5-mini": gpt5ExplorationPrompt,
    "gpt-5.1-codex-max": gpt5ExplorationPrompt,
  },
  smallModel: "gpt-5-mini",
  modelReasoningEfforts: {
    "gpt-5-mini": "xhigh",
  },
  useFunctionApplyPatch: true,
  premiumModelMultipliers: {
    "claude-haiku-4.5": 0.33,
    "claude-sonnet-4": 1,
    "claude-sonnet-4.5": 1,
    "claude-sonnet-4.6": 3,
    "claude-opus-4.5": 3,
    "claude-opus-4.6": 3,
    "claude-opus-4.6-fast": 3,
    "gemini-2.5-pro": 1,
    "gemini-3-flash-preview": 0.33,
    "gemini-3.1-pro-preview": 1,
    "grok-code-fast-1": 0.25,
    "gpt-5.1": 1,
    "gpt-5.2": 1,
    "gpt-5.2-codex": 1,
    "gpt-5.3-codex": 1,
    "gpt-5.4-mini": 0.33,
    "gpt-5.4": 3,
  },
  modelCardMetadata: {},
  hiddenModels: [],
  rateLimitWait: false,
  usageTestIntervalMinutes: 10,
  usageLogCountMode: "request",
  accounts: [],
  activeAccountId: null,
}

let cachedConfig: ReadonlyAppConfig | null = null
let configWriteChain: Promise<void> = Promise.resolve()

const VALID_REASONING_EFFORTS = new Set<ReasoningEffort>([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
])
const VALID_USAGE_LOG_COUNT_MODES = new Set<UsageLogCountMode>([
  "request",
  "conversation",
])

export function isValidReasoningEffort(
  value: unknown,
): value is ReasoningEffort {
  return (
    typeof value === "string"
    && VALID_REASONING_EFFORTS.has(value as ReasoningEffort)
  )
}

export function isValidUsageLogCountMode(
  value: unknown,
): value is UsageLogCountMode {
  return (
    typeof value === "string"
    && VALID_USAGE_LOG_COUNT_MODES.has(value as UsageLogCountMode)
  )
}

export function normalizeUsageLogCountMode(value: unknown): UsageLogCountMode {
  return isValidUsageLogCountMode(value) ? value : "request"
}

function ensureConfigFile(): void {
  try {
    fs.accessSync(PATHS.CONFIG_PATH, fs.constants.R_OK | fs.constants.W_OK)
  } catch {
    fs.mkdirSync(PATHS.APP_DIR, { recursive: true })
    fs.writeFileSync(
      PATHS.CONFIG_PATH,
      `${JSON.stringify(defaultConfig, null, 2)}\n`,
      "utf8",
    )
    try {
      fs.chmodSync(PATHS.CONFIG_PATH, 0o600)
    } catch {
      return
    }
  }
}

function readConfigFromDisk(): AppConfig {
  ensureConfigFile()
  try {
    const raw = fs.readFileSync(PATHS.CONFIG_PATH, "utf8")
    if (!raw.trim()) {
      fs.writeFileSync(
        PATHS.CONFIG_PATH,
        `${JSON.stringify(defaultConfig, null, 2)}\n`,
        "utf8",
      )
      return defaultConfig
    }
    return JSON.parse(raw) as AppConfig
  } catch (error) {
    consola.error("Failed to read config file, using default config", error)
    return defaultConfig
  }
}

function mergeDefaultExtraPrompts(config: AppConfig): {
  mergedConfig: AppConfig
  changed: boolean
} {
  const extraPrompts = config.extraPrompts ?? {}
  const defaultExtraPrompts = defaultConfig.extraPrompts ?? {}

  const missingExtraPromptModels = Object.keys(defaultExtraPrompts).filter(
    (model) => !Object.hasOwn(extraPrompts, model),
  )

  if (missingExtraPromptModels.length === 0) {
    return { mergedConfig: config, changed: false }
  }

  return {
    mergedConfig: {
      ...config,
      extraPrompts: {
        ...defaultExtraPrompts,
        ...extraPrompts,
      },
    },
    changed: true,
  }
}

function mergeDefaultPremiumModelMultipliers(config: AppConfig): {
  mergedConfig: AppConfig
  changed: boolean
} {
  const premiumModelMultipliers = config.premiumModelMultipliers ?? {}
  const defaultPremiumModelMultipliers =
    defaultConfig.premiumModelMultipliers ?? {}

  const missingMultiplierModels = Object.keys(
    defaultPremiumModelMultipliers,
  ).filter((model) => !Object.hasOwn(premiumModelMultipliers, model))

  if (missingMultiplierModels.length === 0) {
    return { mergedConfig: config, changed: false }
  }

  return {
    mergedConfig: {
      ...config,
      premiumModelMultipliers: {
        ...defaultPremiumModelMultipliers,
        ...premiumModelMultipliers,
      },
    },
    changed: true,
  }
}

function mergeDefaultUsageLogCountMode(config: AppConfig): {
  mergedConfig: AppConfig
  changed: boolean
} {
  const usageLogCountMode = normalizeUsageLogCountMode(config.usageLogCountMode)
  const changed = config.usageLogCountMode !== usageLogCountMode

  if (!changed) {
    return { mergedConfig: config, changed: false }
  }

  return {
    mergedConfig: {
      ...config,
      usageLogCountMode,
    },
    changed: true,
  }
}

export function mergeConfigWithDefaults(): AppConfig {
  const config = readConfigFromDisk()
  const extraPromptMergeResult = mergeDefaultExtraPrompts(config)
  const premiumMultiplierMergeResult = mergeDefaultPremiumModelMultipliers(
    extraPromptMergeResult.mergedConfig,
  )
  const usageLogCountModeMergeResult = mergeDefaultUsageLogCountMode(
    premiumMultiplierMergeResult.mergedConfig,
  )
  const mergedConfig = usageLogCountModeMergeResult.mergedConfig
  const changed =
    extraPromptMergeResult.changed
    || premiumMultiplierMergeResult.changed
    || usageLogCountModeMergeResult.changed

  let effectiveConfig = mergedConfig
  if (changed) {
    try {
      writeConfigAtomicallySync(mergedConfig)
      cachedConfig = freezeConfig(mergedConfig)
      return cloneConfig(mergedConfig)
    } catch (writeError) {
      consola.warn(
        "Failed to write merged default config values to config file",
        writeError,
      )
      effectiveConfig = config
    }
  }

  cachedConfig = freezeConfig(effectiveConfig)
  return cloneConfig(effectiveConfig)
}

export function getConfig(): ReadonlyAppConfig {
  cachedConfig ??= freezeConfig(readConfigFromDisk())
  return cachedConfig
}

/**
 * Save config to disk (async)
 */
export async function saveConfig(
  config: AppConfig | ReadonlyAppConfig,
): Promise<void> {
  await runConfigWrite(async () => {
    const normalizedConfig = normalizeConfig(config)
    await writeConfigAtomically(normalizedConfig)
    cachedConfig = freezeConfig(normalizedConfig)
  })
}

export async function updateConfig(
  updater: (
    config: ReadonlyAppConfig,
  ) => AppConfig | ReadonlyAppConfig | Promise<AppConfig | ReadonlyAppConfig>,
): Promise<ReadonlyAppConfig> {
  let nextConfigSnapshot!: ReadonlyAppConfig

  await runConfigWrite(async () => {
    const currentConfig = getMutableConfigSnapshot()
    const readonlyConfig = freezeConfig(currentConfig)
    const updatedConfig = await updater(readonlyConfig)
    const normalizedConfig = normalizeConfig(updatedConfig)
    await writeConfigAtomically(normalizedConfig)
    nextConfigSnapshot = freezeConfig(normalizedConfig)
    cachedConfig = nextConfigSnapshot
  })

  return nextConfigSnapshot
}

export function getExtraPromptForModel(model: string): string {
  const config = getConfig()
  return config.extraPrompts?.[model] ?? ""
}

export function getSmallModel(): string {
  const config = getConfig()
  return config.smallModel ?? "gpt-5-mini"
}

export function getReasoningEffortForModel(model: string): ReasoningEffort {
  const config = getConfig()
  const configuredEffort = config.modelReasoningEfforts?.[model]

  if (configuredEffort && isValidReasoningEffort(configuredEffort)) {
    return configuredEffort
  }

  return "high"
}

export function getMappedModel(model: string): string {
  const config = getConfig()
  return config.modelMapping?.[model] ?? model
}

export function getAnthropicApiKey(): string | undefined {
  const config = getConfig()
  const configApiKey = config.anthropicApiKey?.trim()
  if (configApiKey) {
    return configApiKey
  }

  const envApiKey = process.env.ANTHROPIC_API_KEY?.trim()
  return envApiKey || undefined
}

export function getUsageLogCountMode(): UsageLogCountMode {
  return normalizeUsageLogCountMode(getConfig().usageLogCountMode)
}

function normalizeConfig(config: AppConfig | ReadonlyAppConfig): AppConfig {
  return {
    ...cloneConfig(config),
    usageLogCountMode: normalizeUsageLogCountMode(config.usageLogCountMode),
  } satisfies AppConfig
}

function cloneConfig(config: AppConfig | ReadonlyAppConfig): AppConfig {
  return structuredClone(config) as AppConfig
}

function freezeConfig(config: AppConfig): ReadonlyAppConfig {
  const clonedConfig = cloneConfig(config)
  return deepFreeze(clonedConfig) as ReadonlyAppConfig
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) {
    return value
  }

  const propertyNames = Reflect.ownKeys(value)
  for (const propertyName of propertyNames) {
    const propertyValue = (value as Record<PropertyKey, unknown>)[propertyName]
    if (typeof propertyValue === "object" && propertyValue !== null) {
      deepFreeze(propertyValue)
    }
  }

  return Object.freeze(value)
}

function getMutableConfigSnapshot(): AppConfig {
  return cloneConfig(cachedConfig ?? readConfigFromDisk())
}

function runConfigWrite(task: () => Promise<void>): Promise<void> {
  const run = configWriteChain.then(task)
  configWriteChain = run.catch(() => {})
  return run
}

async function writeConfigAtomically(config: AppConfig): Promise<void> {
  ensureConfigFile()
  const content = `${JSON.stringify(config, null, 2)}\n`
  const tempPath = buildTempConfigPath()

  await fs.promises.writeFile(tempPath, content, "utf8")
  try {
    await fs.promises.chmod(tempPath, 0o600)
  } catch {
    // Ignore chmod failures on unsupported platforms.
  }

  try {
    await fs.promises.rename(tempPath, PATHS.CONFIG_PATH)
  } catch (error) {
    if (isRenameReplaceError(error)) {
      await fs.promises.rm(PATHS.CONFIG_PATH, { force: true })
      await fs.promises.rename(tempPath, PATHS.CONFIG_PATH)
    } else {
      throw error
    }
  } finally {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {})
  }
}

function writeConfigAtomicallySync(config: AppConfig): void {
  ensureConfigFile()
  const content = `${JSON.stringify(config, null, 2)}\n`
  const tempPath = buildTempConfigPath()

  fs.writeFileSync(tempPath, content, "utf8")
  try {
    fs.chmodSync(tempPath, 0o600)
  } catch {
    // Ignore chmod failures on unsupported platforms.
  }

  try {
    fs.renameSync(tempPath, PATHS.CONFIG_PATH)
  } catch (error) {
    if (isRenameReplaceError(error)) {
      fs.rmSync(PATHS.CONFIG_PATH, { force: true })
      fs.renameSync(tempPath, PATHS.CONFIG_PATH)
    } else {
      throw error
    }
  } finally {
    try {
      fs.rmSync(tempPath, { force: true })
    } catch {
      // Ignore cleanup failures.
    }
  }
}

function buildTempConfigPath(): string {
  return path.join(
    PATHS.APP_DIR,
    `config.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  )
}

function isRenameReplaceError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false
  }

  const code = (error as { code?: unknown }).code
  return code === "EEXIST" || code === "EPERM"
}
