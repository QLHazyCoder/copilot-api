import consola from "consola"
import fs from "node:fs"

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
  // Account management
  accounts?: Array<AccountConfig>
  activeAccountId?: string | null
}

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
  accounts: [],
  activeAccountId: null,
}

let cachedConfig: AppConfig | null = null

const VALID_REASONING_EFFORTS = new Set<ReasoningEffort>([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
])

export function isValidReasoningEffort(
  value: unknown,
): value is ReasoningEffort {
  return (
    typeof value === "string"
    && VALID_REASONING_EFFORTS.has(value as ReasoningEffort)
  )
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

export function mergeConfigWithDefaults(): AppConfig {
  const config = readConfigFromDisk()
  const extraPromptMergeResult = mergeDefaultExtraPrompts(config)
  const premiumMultiplierMergeResult = mergeDefaultPremiumModelMultipliers(
    extraPromptMergeResult.mergedConfig,
  )
  const mergedConfig = premiumMultiplierMergeResult.mergedConfig
  const changed =
    extraPromptMergeResult.changed || premiumMultiplierMergeResult.changed

  if (changed) {
    try {
      fs.writeFileSync(
        PATHS.CONFIG_PATH,
        `${JSON.stringify(mergedConfig, null, 2)}\n`,
        "utf8",
      )
    } catch (writeError) {
      consola.warn(
        "Failed to write merged default config values to config file",
        writeError,
      )
    }
  }

  cachedConfig = mergedConfig
  return mergedConfig
}

export function getConfig(): AppConfig {
  cachedConfig ??= readConfigFromDisk()
  return cachedConfig
}

/**
 * Save config to disk (async)
 */
export async function saveConfig(config: AppConfig): Promise<void> {
  ensureConfigFile()
  cachedConfig = config
  const content = `${JSON.stringify(config, null, 2)}\n`
  await fs.promises.writeFile(PATHS.CONFIG_PATH, content, "utf8")
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
