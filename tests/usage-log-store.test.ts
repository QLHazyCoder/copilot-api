import { describe, expect, test } from "bun:test"

import {
  appendUsageRequestLog,
  clearAllUsageLogs,
  clearUsageLogs,
  listUsageLogs,
  updateRequestUsageLogSummary,
} from "../src/lib/usage-log-store"

describe("appendUsageRequestLog dedupe rules", () => {
  test("keeps request mode as per-request logging even with conversation id", () => {
    const accountId = `request-account-${crypto.randomUUID()}`
    const conversationId = `request-thread-${crypto.randomUUID()}`

    const first = appendUsageRequestLog({
      accountId,
      endpoint: "/chat/completions",
      responseType: "non_streaming",
      statusCode: 200,
      model: "gpt-test",
      multiplier: 1,
      delta: 1,
      countMode: "request",
      conversationId,
    })
    const second = appendUsageRequestLog({
      accountId,
      endpoint: "/chat/completions",
      responseType: "non_streaming",
      statusCode: 200,
      model: "gpt-test",
      multiplier: 1,
      delta: 1,
      countMode: "request",
      conversationId,
    })

    const result = listUsageLogs({ accountId, source: "request", limit: 10 })

    expect(first.inserted).toBe(true)
    expect(second.inserted).toBe(true)
    expect(first.logId).not.toBe(second.logId)
    expect(result.logs).toHaveLength(2)
    expect(result.logs.every((log) => log.requestCount === 1)).toBe(true)
    expect(result.logs.every((log) => log.conversationId === undefined)).toBe(
      true,
    )
  })

  test("dedupes repeated requests in conversation mode", () => {
    const accountId = `conversation-account-${crypto.randomUUID()}`
    const conversationId = `conversation-thread-${crypto.randomUUID()}`

    const first = appendUsageRequestLog({
      accountId,
      endpoint: "/chat/completions",
      responseType: "streaming",
      statusCode: 200,
      model: "gpt-test",
      multiplier: 1,
      delta: 1,
      countMode: "conversation",
      conversationId,
    })
    const second = appendUsageRequestLog({
      accountId,
      endpoint: "/chat/completions",
      responseType: "streaming",
      statusCode: 200,
      model: "gpt-test",
      multiplier: 1,
      delta: 1,
      countMode: "conversation",
      conversationId,
    })

    const result = listUsageLogs({ accountId, source: "request", limit: 10 })

    expect(first.inserted).toBe(true)
    expect(second.inserted).toBe(false)
    expect(second.logId).toBe(first.logId)
    expect(result.logs).toHaveLength(1)
    expect(result.logs[0]?.requestCount).toBe(2)
    expect(result.logs[0]?.conversationId).toBe(conversationId)
  })

  test("keeps responseType out of the conversation dedupe key", () => {
    const accountId = `conversation-account-${crypto.randomUUID()}`
    const conversationId = `conversation-thread-${crypto.randomUUID()}`

    const first = appendUsageRequestLog({
      accountId,
      endpoint: "/chat/completions",
      responseType: "streaming",
      statusCode: 200,
      model: "gpt-test",
      multiplier: 1,
      delta: 1,
      countMode: "conversation",
      conversationId,
    })
    const second = appendUsageRequestLog({
      accountId,
      endpoint: "/chat/completions",
      responseType: "non_streaming",
      statusCode: 200,
      model: "gpt-test",
      multiplier: 1,
      delta: 1,
      countMode: "conversation",
      conversationId,
    })

    const result = listUsageLogs({ accountId, source: "request", limit: 10 })

    expect(first.logId).toBe(second.logId)
    expect(second.inserted).toBe(false)
    expect(result.logs).toHaveLength(1)
    expect(result.logs[0]?.requestCount).toBe(2)
  })

  test("keeps statusCode out of the conversation dedupe key", () => {
    const accountId = `conversation-account-${crypto.randomUUID()}`
    const conversationId = `conversation-thread-${crypto.randomUUID()}`

    const first = appendUsageRequestLog({
      accountId,
      endpoint: "/chat/completions",
      responseType: "streaming",
      statusCode: 200,
      model: "gpt-test",
      multiplier: 1,
      delta: 1,
      countMode: "conversation",
      conversationId,
    })
    const second = appendUsageRequestLog({
      accountId,
      endpoint: "/chat/completions",
      responseType: "streaming",
      statusCode: 201,
      model: "gpt-test",
      multiplier: 1,
      delta: 1,
      countMode: "conversation",
      conversationId,
    })

    const result = listUsageLogs({ accountId, source: "request", limit: 10 })

    expect(first.logId).toBe(second.logId)
    expect(second.inserted).toBe(false)
    expect(result.logs).toHaveLength(1)
    expect(result.logs[0]?.requestCount).toBe(2)
  })

  test("creates a new conversation log row when any variant field changes", () => {
    const cases = [
      {
        name: "endpoint",
        nextPayload: {
          endpoint: "/responses",
        },
      },
      {
        name: "model",
        nextPayload: {
          model: "gpt-test-2",
        },
      },
      {
        name: "multiplier",
        nextPayload: {
          multiplier: 3,
        },
      },
    ] as const

    for (const testCase of cases) {
      const accountId = `${testCase.name}-account-${crypto.randomUUID()}`
      const conversationId = `${testCase.name}-thread-${crypto.randomUUID()}`
      const first = appendUsageRequestLog({
        accountId,
        endpoint: "/chat/completions",
        responseType: "streaming",
        statusCode: 200,
        model: "gpt-test",
        multiplier: 1,
        delta: 1,
        countMode: "conversation",
        conversationId,
      })
      const second = appendUsageRequestLog({
        accountId,
        endpoint: "/chat/completions",
        responseType: "streaming",
        statusCode: 200,
        model: "gpt-test",
        multiplier: 1,
        delta: 1,
        countMode: "conversation",
        conversationId,
        ...testCase.nextPayload,
      })
      const result = listUsageLogs({
        accountId,
        source: "request",
        limit: 10,
      })

      expect(first.logId).not.toBe(second.logId)
      expect(second.inserted).toBe(true)
      expect(second.reason).toBe("conversation-variant-inserted")
      expect(result.logs).toHaveLength(2)
    }
  })
})

describe("updateRequestUsageLogSummary quota delta", () => {
  test("computes quotaDelta from first usage snapshot, latest usage snapshot and multiplier", () => {
    const accountId = `quota-delta-account-${crypto.randomUUID()}`
    const inserted = appendUsageRequestLog({
      accountId,
      endpoint: "/responses",
      responseType: "streaming",
      statusCode: 200,
      model: "gpt-5.4",
      multiplier: 3,
      delta: 3,
      countMode: "request",
    })

    updateRequestUsageLogSummary(inserted.logId, {
      premiumUsed: 24,
      premiumRemaining: 276,
      premiumEntitlement: 300,
      chatUsed: 0,
      completionsUsed: 0,
    })

    let result = listUsageLogs({ accountId, source: "request", limit: 10 })
    expect(result.logs[0]?.quotaDelta).toBe(3)

    updateRequestUsageLogSummary(inserted.logId, {
      premiumUsed: 26,
      premiumRemaining: 274,
      premiumEntitlement: 300,
      chatUsed: 0,
      completionsUsed: 0,
    })

    result = listUsageLogs({ accountId, source: "request", limit: 10 })
    expect(result.logs[0]?.quotaDelta).toBe(5)
  })
})

describe("clearUsageLogs", () => {
  test("clears only the selected account's local usage records", () => {
    const accountId = `clear-account-${crypto.randomUUID()}`
    const otherAccountId = `other-account-${crypto.randomUUID()}`

    appendUsageRequestLog({
      accountId,
      endpoint: "/responses",
      responseType: "streaming",
      statusCode: 200,
      model: "gpt-5.4",
      multiplier: 3,
      delta: 3,
      countMode: "request",
    })
    appendUsageRequestLog({
      accountId: otherAccountId,
      endpoint: "/responses",
      responseType: "streaming",
      statusCode: 200,
      model: "gpt-5.4",
      multiplier: 3,
      delta: 3,
      countMode: "request",
    })

    const deletedCount = clearUsageLogs(accountId)

    expect(deletedCount).toBe(1)
    expect(
      listUsageLogs({ accountId, source: "request", limit: 10 }).logs,
    ).toHaveLength(0)
    expect(
      listUsageLogs({ accountId: otherAccountId, source: "request", limit: 10 })
        .logs,
    ).toHaveLength(1)
  })

  test("clears all accounts' local usage records", () => {
    const firstAccountId = `clear-all-account-${crypto.randomUUID()}`
    const secondAccountId = `clear-all-account-${crypto.randomUUID()}`

    clearAllUsageLogs()

    appendUsageRequestLog({
      accountId: firstAccountId,
      endpoint: "/responses",
      responseType: "streaming",
      statusCode: 200,
      model: "gpt-5.4",
      multiplier: 3,
      delta: 3,
      countMode: "request",
    })
    appendUsageRequestLog({
      accountId: secondAccountId,
      endpoint: "/responses",
      responseType: "streaming",
      statusCode: 200,
      model: "gpt-5.4",
      multiplier: 3,
      delta: 3,
      countMode: "request",
    })

    const deletedCount = clearAllUsageLogs()

    expect(deletedCount).toBe(2)
    expect(
      listUsageLogs({ accountId: firstAccountId, source: "request", limit: 10 })
        .logs,
    ).toHaveLength(0)
    expect(
      listUsageLogs({
        accountId: secondAccountId,
        source: "request",
        limit: 10,
      }).logs,
    ).toHaveLength(0)
  })
})
