import { Hono } from "hono"

import { getConfig } from "~/lib/config"
import { runtimeManager } from "~/lib/runtime-manager"
import { createChatCompletions } from "~/services/copilot/create-chat-completions"
import { getCopilotUsage } from "~/services/github/get-copilot-usage"

export const usageRoute = new Hono()

const GPT4O_HEALTH_CHECK_MODEL = "gpt-4o"

function getConfiguredHealthCheckDelayMs(): number | null {
  const configuredInterval = getConfig().usageTestIntervalMinutes
  if (configuredInterval === null) {
    return null
  }

  const intervalMinutes =
    (
      typeof configuredInterval === "number"
      && Number.isFinite(configuredInterval)
      && configuredInterval > 0
    ) ?
      configuredInterval
    : 10

  return Math.floor(intervalMinutes * 60_000)
}

interface Gpt4oHealthCheckState {
  inFlight: Promise<boolean | null> | null
  isAvailable: boolean | null
  lastCheckedAt: number | null
}

const gpt4oHealthCheckStateByAccountId = new Map<
  string,
  Gpt4oHealthCheckState
>()

function getHealthCheckState(accountId: string): Gpt4oHealthCheckState {
  let healthCheckState = gpt4oHealthCheckStateByAccountId.get(accountId)
  if (healthCheckState) {
    return healthCheckState
  }

  healthCheckState = {
    inFlight: null,
    isAvailable: null,
    lastCheckedAt: null,
  }
  gpt4oHealthCheckStateByAccountId.set(accountId, healthCheckState)
  return healthCheckState
}

function isHealthCheckStale(state: Gpt4oHealthCheckState): boolean {
  const delayMs = getConfiguredHealthCheckDelayMs()
  if (delayMs === null) {
    return false
  }

  if (state.lastCheckedAt === null) {
    return true
  }

  return Date.now() - state.lastCheckedAt >= delayMs
}

function runGpt4oHealthCheck(accountId: string): Promise<boolean | null> {
  const healthCheckState = getHealthCheckState(accountId)
  if (healthCheckState.inFlight) {
    return healthCheckState.inFlight
  }

  const checkPromise = createChatCompletions(
    {
      model: GPT4O_HEALTH_CHECK_MODEL,
      messages: [{ role: "user", content: "ping" }],
      stream: false,
      max_tokens: 1,
      temperature: 0,
    },
    { initiator: "agent", skipUsageLog: true },
  )
    .then(() => true)
    .catch(() => false)
    .then((isAvailable) => {
      healthCheckState.isAvailable = isAvailable
      return isAvailable
    })
    .finally(() => {
      healthCheckState.lastCheckedAt = Date.now()
      healthCheckState.inFlight = null
    })

  healthCheckState.inFlight = checkPromise
  return checkPromise
}

async function getGpt4oHealthAvailability(): Promise<boolean | null> {
  const runtime = runtimeManager.getCurrentContext()
  if (!runtime) {
    return null
  }

  const healthCheckState = getHealthCheckState(runtime.accountId)
  if (
    healthCheckState.isAvailable === null
    || isHealthCheckStale(healthCheckState)
  ) {
    return await runGpt4oHealthCheck(runtime.accountId)
  }

  return healthCheckState.isAvailable
}

usageRoute.get("/", async (c) => {
  try {
    const usage = await getCopilotUsage()

    const gpt4oAvailable = await getGpt4oHealthAvailability()
    const effectiveUsage = {
      ...usage,
      chat_enabled: usage.chat_enabled && gpt4oAvailable !== false,
    }

    return c.json(effectiveUsage)
  } catch (error) {
    console.error("Error fetching Copilot usage:", error)
    return c.json({ error: "Failed to fetch Copilot usage" }, 500)
  }
})
