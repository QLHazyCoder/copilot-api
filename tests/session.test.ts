import { describe, expect, test } from "bun:test"
import { Hono, type Context } from "hono"

import { normalizeUsageLogCountMode } from "../src/lib/config"
import {
  getConversationIdFromAnthropicPayload,
  getConversationIdFromHeaders,
  getConversationIdFromResponsesPayload,
  normalizeConversationId,
  parseAnthropicUserIdMetadata,
} from "../src/lib/session"

async function evaluateWithContext<T>(
  headers: Record<string, string>,
  evaluator: (c: Context) => T,
): Promise<T> {
  let result!: T
  const app = new Hono()

  app.get("/", (c) => {
    result = evaluator(c)
    return c.text("ok")
  })

  await app.request("http://localhost/", { headers })
  return result
}

describe("normalizeUsageLogCountMode", () => {
  test("falls back to request for invalid values", () => {
    expect(normalizeUsageLogCountMode("conversation")).toBe("conversation")
    expect(normalizeUsageLogCountMode("request")).toBe("request")
    expect(normalizeUsageLogCountMode("unexpected")).toBe("request")
    expect(normalizeUsageLogCountMode(undefined)).toBe("request")
  })
})

describe("parseAnthropicUserIdMetadata", () => {
  test("extracts safety identifier and prompt cache key", () => {
    const metadata = parseAnthropicUserIdMetadata(
      "user_alice_account_demo_session_thread-1",
    )

    expect(metadata.safetyIdentifier).toBe("alice")
    expect(metadata.promptCacheKey).toBe("thread-1")
    expect(metadata.conversationId).toBe(normalizeConversationId("thread-1"))
  })

  test("returns empty metadata when user id is absent", () => {
    const metadata = parseAnthropicUserIdMetadata(undefined)

    expect(metadata.safetyIdentifier).toBeNull()
    expect(metadata.promptCacheKey).toBeNull()
    expect(metadata.conversationId).toBeUndefined()
  })

  test("extracts session_id from json-style anthropic user id payload", () => {
    const metadata = parseAnthropicUserIdMetadata(
      '{"device_id":"device-1","account_uuid":"","session_id":"thread-json-1"}',
    )

    expect(metadata.promptCacheKey).toBe("thread-json-1")
    expect(metadata.conversationId).toBe(
      normalizeConversationId("thread-json-1"),
    )
    expect(metadata.conversationIdSource).toBe("user-id-json-session-id")
  })
})

describe("conversation id extraction", () => {
  test("prefers x-interaction-id over x-session-id headers", async () => {
    const conversationId = await evaluateWithContext(
      {
        "x-interaction-id": "interaction-1",
        "x-session-id": "session-1",
      },
      (c) => getConversationIdFromHeaders(c),
    )

    expect(conversationId).toBe(normalizeConversationId("interaction-1"))
  })

  test("prefers anthropic metadata over request headers", async () => {
    const conversationId = await evaluateWithContext(
      {
        "x-interaction-id": "interaction-1",
      },
      (c) =>
        getConversationIdFromAnthropicPayload(
          {
            model: "claude-opus-4-6",
            max_tokens: 128,
            messages: [{ role: "user", content: "hello" }],
            metadata: {
              user_id: "user_alice_account_demo_session_thread-2",
            },
          },
          c,
        ),
    )

    expect(conversationId).toBe(normalizeConversationId("thread-2"))
  })

  test("uses json-style anthropic metadata session_id when present", async () => {
    const conversationId = await evaluateWithContext({}, (c) =>
      getConversationIdFromAnthropicPayload(
        {
          model: "claude-opus-4-6",
          max_tokens: 128,
          messages: [{ role: "user", content: "hello" }],
          metadata: {
            user_id:
              '{"device_id":"device-1","account_uuid":"","session_id":"thread-json-2"}',
          },
        },
        c,
      ),
    )

    expect(conversationId).toBe(normalizeConversationId("thread-json-2"))
  })

  test("uses prompt_cache_key for direct responses requests", async () => {
    const conversationId = await evaluateWithContext(
      {
        "x-interaction-id": "interaction-1",
      },
      (c) =>
        getConversationIdFromResponsesPayload(
          {
            prompt_cache_key: "responses-thread-1",
          },
          c,
        ),
    )

    expect(conversationId).toBe(normalizeConversationId("responses-thread-1"))
  })
})
