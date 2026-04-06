import { describe, expect, test } from "bun:test"

import type { AnthropicMessagesPayload } from "~/routes/messages/anthropic-types"

import {
  inferAnthropicInitiatorFromLastMessage,
  sanitizeOrphanToolResults,
} from "~/routes/messages/handler"
import { sanitizeAnthropicPayload } from "~/routes/messages/sanitize"

describe("sanitizeOrphanToolResults", () => {
  test("keeps tool_result when matching previous tool_use exists", () => {
    const payload: AnthropicMessagesPayload = {
      model: "claude-opus-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_1",
              name: "test_tool",
              input: { q: "hello" },
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_1",
              content: "tool output",
            },
          ],
        },
      ],
    }

    sanitizeOrphanToolResults(payload)

    const userMessage = payload.messages[1]
    if (userMessage.role !== "user" || !Array.isArray(userMessage.content)) {
      throw new Error("expected user content array")
    }

    const firstBlock = userMessage.content[0]
    expect(firstBlock.type).toBe("tool_result")
    if (firstBlock.type === "tool_result") {
      expect(firstBlock.tool_use_id).toBe("toolu_1")
      expect(firstBlock.content).toBe("tool output")
    }
  })

  test("converts orphan tool_result to text", () => {
    const payload: AnthropicMessagesPayload = {
      model: "claude-opus-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "no tool use here" }],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_missing",
              content: "Launching skill: remote-control",
            },
          ],
        },
      ],
    }

    sanitizeOrphanToolResults(payload)

    const userMessage = payload.messages[1]
    if (userMessage.role !== "user" || !Array.isArray(userMessage.content)) {
      throw new Error("expected user content array")
    }

    const firstBlock = userMessage.content[0]
    expect(firstBlock.type).toBe("text")
    if (firstBlock.type === "text") {
      expect(firstBlock.text).toBe("Launching skill: remote-control")
    }
  })
})

describe("inferAnthropicInitiatorFromLastMessage", () => {
  test("returns agent for tool_result + text follow-up", () => {
    const payload: AnthropicMessagesPayload = {
      model: "claude-opus-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "working" }],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_missing",
              content: "Launching skill: remote-control",
            },
            {
              type: "text",
              text: "Skill startup log",
            },
          ],
        },
      ],
    }

    expect(inferAnthropicInitiatorFromLastMessage(payload)).toBe("agent")
  })

  test("returns user for normal text prompt", () => {
    const payload: AnthropicMessagesPayload = {
      model: "claude-opus-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "hello" }],
        },
      ],
    }

    expect(inferAnthropicInitiatorFromLastMessage(payload)).toBe("user")
  })
})

describe("sanitizeAnthropicPayload", () => {
  test("keeps only standard anthropic tool fields", () => {
    const payload = {
      model: "claude-opus-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: "hello" }],
      context_management: { mode: "auto" },
      tools: [
        {
          name: "edit_file",
          description: "edit a file",
          input_schema: {
            type: "object",
            properties: {
              file_path: { type: "string" },
            },
          },
          custom: {
            eager_input_streaming: true,
          },
          extra_field: true,
        },
      ],
    } as unknown as AnthropicMessagesPayload & {
      context_management: Record<string, unknown>
    }

    sanitizeAnthropicPayload(payload)

    expect("context_management" in payload).toBe(false)
    expect(payload.tools).toEqual([
      {
        name: "edit_file",
        description: "edit a file",
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
