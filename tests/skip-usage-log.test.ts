import { afterAll, beforeEach, describe, expect, test } from "bun:test"

import { mergeConfigWithDefaults, saveConfig } from "../src/lib/config"
import { copilotTokenManager } from "../src/lib/copilot-token-manager"
import { state } from "../src/lib/state"
import { listUsageLogs } from "../src/lib/usage-log-store"
import { createChatCompletions } from "../src/services/copilot/create-chat-completions"

const originalFetch = globalThis.fetch
const originalSetTimeout = globalThis.setTimeout
const tokenManager = copilotTokenManager as unknown as {
  tokenExpiresAt: number
}
type TimeoutHandler = Parameters<typeof setTimeout>[0]

interface FetchRecord {
  pathname: string
}

const fetchRecords: Array<FetchRecord> = []

function runTimerHandler(handler: TimeoutHandler): void {
  if (typeof handler !== "function") {
    return
  }

  const callback = handler as () => void
  callback()
}

function getRequestUrl(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input
  }

  if (input instanceof URL) {
    return input.toString()
  }

  return input.url
}

beforeEach(async () => {
  fetchRecords.length = 0
  state.accountType = "individual"
  state.copilotToken = "test-copilot-token"
  state.githubToken = "test-github-token"
  state.vsCodeVersion = "1.0.0"
  state.rateLimitSeconds = undefined
  state.lastRequestTimestamp = undefined
  state.rateLimitWait = false
  tokenManager.tokenExpiresAt = Math.floor(Date.now() / 1000) + 3600

  const config = mergeConfigWithDefaults()
  await saveConfig({
    ...config,
    activeAccountId: `skip-usage-account-${crypto.randomUUID()}`,
    usageLogCountMode: "request",
  })

  globalThis.setTimeout = ((handler: TimeoutHandler) => {
    runTimerHandler(handler)
    return 0
  }) as unknown as typeof setTimeout

  globalThis.fetch = ((input) => {
    const url = getRequestUrl(input)
    const pathname = new URL(url).pathname
    fetchRecords.push({ pathname })

    if (pathname === "/copilot_internal/user") {
      return Promise.resolve(
        Response.json({
          chat_enabled: true,
          quota_reset_date: "2099-01-01",
          quota_snapshots: {
            premium_interactions: {
              entitlement: 100,
              remaining: 99,
              unlimited: false,
              overage_count: 0,
              overage_permitted: false,
              percent_remaining: 99,
              quota_id: "premium",
              quota_remaining: 99,
            },
            chat: {
              entitlement: 100,
              remaining: 99,
              unlimited: false,
              overage_count: 0,
              overage_permitted: false,
              percent_remaining: 99,
              quota_id: "chat",
              quota_remaining: 99,
            },
            completions: {
              entitlement: 100,
              remaining: 99,
              unlimited: false,
              overage_count: 0,
              overage_permitted: false,
              percent_remaining: 99,
              quota_id: "completions",
              quota_remaining: 99,
            },
          },
        }),
      )
    }

    return Promise.resolve(
      Response.json({
        id: "chat_1",
        object: "chat.completion",
        created: 1,
        model: "chat-model",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "ok",
            },
            logprobs: null,
            finish_reason: "stop",
          },
        ],
      }),
    )
  }) as typeof fetch
})

afterAll(() => {
  globalThis.fetch = originalFetch
  globalThis.setTimeout = originalSetTimeout
})

describe("skipUsageLog", () => {
  test("skips local usage log persistence and summary refresh", async () => {
    const accountId = mergeConfigWithDefaults().activeAccountId

    await createChatCompletions(
      {
        model: "chat-model",
        messages: [{ role: "user", content: "ping" }],
        stream: false,
      },
      {
        initiator: "agent",
        skipUsageLog: true,
      },
    )

    const usageFetchCount = fetchRecords.filter(
      (record) => record.pathname === "/copilot_internal/user",
    ).length
    const result = listUsageLogs({
      accountId,
      source: "request",
      limit: 10,
    })

    expect(usageFetchCount).toBe(0)
    expect(result.logs).toHaveLength(0)
  })
})
