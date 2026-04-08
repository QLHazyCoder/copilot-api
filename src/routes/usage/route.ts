import { Hono } from "hono"

import { getConfig } from "~/lib/config"
import { state } from "~/lib/state"
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
  lastAccountId: string | null
  isAvailable: boolean | null
  lastCheckedAt: number | null
  isChecking: boolean
  timer: ReturnType<typeof setTimeout> | null
}

const gpt4oHealthCheckState: Gpt4oHealthCheckState = {
  lastAccountId: null,
  isAvailable: null,
  lastCheckedAt: null,
  isChecking: false,
  timer: null,
}

function resetHealthCheckStateForAccount(accountId: string | null): void {
  if (gpt4oHealthCheckState.lastAccountId === accountId) {
    return
  }

  gpt4oHealthCheckState.lastAccountId = accountId
  gpt4oHealthCheckState.isAvailable = null
  gpt4oHealthCheckState.lastCheckedAt = null
}

function scheduleNextHealthCheck(delayMs?: number): void {
  if (gpt4oHealthCheckState.timer) {
    clearTimeout(gpt4oHealthCheckState.timer)
  }

  const nextDelayMs =
    typeof delayMs === "number" && Number.isFinite(delayMs) && delayMs >= 0 ?
      Math.floor(delayMs)
    : getConfiguredHealthCheckDelayMs()

  if (nextDelayMs === null) {
    gpt4oHealthCheckState.timer = null
    return
  }

  gpt4oHealthCheckState.timer = setTimeout(() => {
    void runGpt4oHealthCheck()
  }, nextDelayMs)
}

let gpt4oHealthCheckInFlight: Promise<boolean | null> | null = null

function runGpt4oHealthCheck(): Promise<boolean | null> {
  const activeAccountId = getConfig().activeAccountId ?? null
  resetHealthCheckStateForAccount(activeAccountId)

  if (!activeAccountId || !state.githubToken) {
    gpt4oHealthCheckState.isAvailable = null
    gpt4oHealthCheckState.lastCheckedAt = Date.now()
    scheduleNextHealthCheck()
    return Promise.resolve(null)
  }

  if (gpt4oHealthCheckInFlight) {
    return gpt4oHealthCheckInFlight
  }

  gpt4oHealthCheckState.isChecking = true

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
      gpt4oHealthCheckState.isAvailable = isAvailable
      return isAvailable
    })
    .finally(() => {
      gpt4oHealthCheckState.lastCheckedAt = Date.now()
      gpt4oHealthCheckState.isChecking = false
      gpt4oHealthCheckInFlight = null
      scheduleNextHealthCheck()
    })

  gpt4oHealthCheckInFlight = checkPromise
  return checkPromise
}

async function getGpt4oHealthAvailability(): Promise<boolean | null> {
  const activeAccountId = getConfig().activeAccountId ?? null
  const hasAccountChanged =
    gpt4oHealthCheckState.lastAccountId !== activeAccountId

  if (hasAccountChanged || gpt4oHealthCheckState.isAvailable === null) {
    await runGpt4oHealthCheck()
  }

  return gpt4oHealthCheckState.isAvailable
}

scheduleNextHealthCheck(0)

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
