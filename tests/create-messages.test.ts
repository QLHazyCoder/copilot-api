import { describe, expect, test } from "bun:test"

import type { AnthropicMessagesPayload } from "~/routes/messages/anthropic-types"

import { sanitizeAnthropicPayload } from "~/routes/messages/sanitize"

describe("sanitizeAnthropicPayload", () => {
  test("should remove unsupported private tool fields and keep standard tool shape", () => {
    const payload = {
      model: "claude-3-5-sonnet",
      messages: [{ role: "user", content: "hello" }],
      max_tokens: 1024,
      context_management: { mode: "auto" },
      tools: [
        {
          name: "write_file",
          description: "write a file",
          input_schema: {
            type: "object",
            properties: {
              file_path: { type: "string" },
            },
          },
          type: "custom",
          custom: {
            eager_input_streaming: true,
          },
          cache_control: {
            type: "ephemeral",
          },
        },
      ],
    } as unknown as AnthropicMessagesPayload & {
      context_management: Record<string, unknown>
    }

    sanitizeAnthropicPayload(payload)

    expect("context_management" in payload).toBe(false)
    expect(payload.tools).toEqual([
      {
        name: "write_file",
        description: "write a file",
        input_schema: {
          type: "object",
          properties: {
            file_path: { type: "string" },
          },
        },
      },
    ])
  })
})
