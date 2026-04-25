import { afterAll, beforeEach, describe, expect, test } from "bun:test"

import type { AnthropicMessagesPayload } from "~/routes/messages/anthropic-types"
import type { ChatCompletionsPayload } from "~/services/copilot/create-chat-completions"
import type { ResponsesPayload } from "~/services/copilot/create-responses"
import type { Model, ModelsResponse } from "~/services/copilot/get-models"

import { mergeConfigWithDefaults, saveConfig } from "~/lib/config"
import {
  ensureChatPayloadWithinContextWindow,
  ensureMessagesPayloadWithinContextWindow,
  ensureResponsesPayloadWithinContextWindow,
} from "~/lib/context-budget"
import { ContextOverflowError } from "~/lib/copilot-error"
import { copilotTokenManager } from "~/lib/copilot-token-manager"
import { state } from "~/lib/state"

const originalConfig = mergeConfigWithDefaults()
const originalFetch = globalThis.fetch

function createModel(id: string, maxPromptTokens: number): Model {
  return {
    id,
    name: id,
    object: "model",
    preview: false,
    vendor: "test",
    version: "1",
    model_picker_enabled: true,
    supported_endpoints: ["/chat/completions", "/responses", "/v1/messages"],
    capabilities: {
      family: "test",
      object: "capabilities",
      tokenizer: "o200k_base",
      type: "chat",
      limits: {
        max_output_tokens: 512,
        max_prompt_tokens: maxPromptTokens,
      },
      supports: {
        streaming: true,
      },
    },
  }
}

function setModels(models: Array<Model>): void {
  const payload: ModelsResponse = {
    object: "list",
    data: models,
  }
  state.models = payload
}

beforeEach(async () => {
  copilotTokenManager.clear()
  state.accountType = "individual"
  state.copilotToken = "test-copilot-token"
  state.githubToken = "test-github-token"
  state.vsCodeVersion = "1.0.0"
  await saveConfig({
    ...originalConfig,
    contextManagement: {
      mode: "trim",
    },
  })
  globalThis.fetch = originalFetch
})

afterAll(async () => {
  await saveConfig(originalConfig)
  globalThis.fetch = originalFetch
})

describe("context budget", () => {
  test("trims oldest chat turn while preserving system and latest user turn", async () => {
    const model = createModel("chat-budget-model", 80)
    setModels([model])

    const payload: ChatCompletionsPayload = {
      model: model.id,
      messages: [
        { role: "system", content: "follow the rules" },
        { role: "user", content: "old ".repeat(80) },
        { role: "assistant", content: "old answer" },
        { role: "user", content: "latest request" },
      ],
    }

    const trimmedPayload = await ensureChatPayloadWithinContextWindow(
      payload,
      model,
    )

    expect(trimmedPayload.messages).toEqual([
      { role: "system", content: "follow the rules" },
      { role: "user", content: "latest request" },
    ])
  })

  test("trims oldest responses turn while preserving instructions and latest user turn", async () => {
    const model = createModel("responses-budget-model", 60)
    setModels([model])

    const payload: ResponsesPayload = {
      model: model.id,
      instructions: "keep the style",
      input: [
        {
          type: "message",
          role: "user",
          content: "old ".repeat(80),
        },
        {
          type: "message",
          role: "assistant",
          content: "old answer",
        },
        {
          type: "message",
          role: "user",
          content: "latest request",
        },
      ],
      max_output_tokens: 64,
    }

    const trimmedPayload = await ensureResponsesPayloadWithinContextWindow(
      payload,
      model,
    )

    expect(trimmedPayload.instructions).toBe("keep the style")
    expect(trimmedPayload.input).toEqual([
      {
        type: "message",
        role: "user",
        content: "latest request",
      },
    ])
  })

  test("trims oldest anthropic turn while preserving system and latest user turn", async () => {
    const model = createModel("claude-budget-model", 50)
    setModels([model])

    const payload: AnthropicMessagesPayload = {
      model: model.id,
      max_tokens: 64,
      system: "important system prompt",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "old ".repeat(70) }],
        },
        {
          role: "assistant",
          content: [{ type: "text", text: "old answer" }],
        },
        {
          role: "user",
          content: [{ type: "text", text: "latest request" }],
        },
      ],
    }

    const trimmedPayload = await ensureMessagesPayloadWithinContextWindow(
      payload,
      model,
    )

    expect(trimmedPayload.system).toBe("important system prompt")
    expect(trimmedPayload.messages).toEqual([
      {
        role: "user",
        content: [{ type: "text", text: "latest request" }],
      },
    ])
  })

  test("throws structured context overflow when latest chat turn alone exceeds budget", async () => {
    const model = createModel("chat-overflow-model", 40)
    setModels([model])

    const payload: ChatCompletionsPayload = {
      model: model.id,
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "latest ".repeat(120) },
      ],
      max_tokens: 32,
    }

    let thrownError: unknown

    try {
      await ensureChatPayloadWithinContextWindow(payload, model)
    } catch (error) {
      thrownError = error
    }

    expect(thrownError).toBeInstanceOf(ContextOverflowError)
    if (!(thrownError instanceof ContextOverflowError)) {
      throw new TypeError("expected ContextOverflowError")
    }

    expect(thrownError.details?.endpoint).toBe("/chat/completions")
    expect(thrownError.details?.model).toBe(model.id)
    expect(thrownError.details?.promptBudget).toBe(40)
  })

  test("summarizes oldest chat turns before falling back to trimming", async () => {
    const model = createModel("chat-budget-model", 500)
    const summarizerModel = createModel("gpt-5-mini", 500)
    setModels([model, summarizerModel])

    await saveConfig({
      ...originalConfig,
      smallModel: summarizerModel.id,
      contextManagement: {
        mode: "summarize_then_trim",
        summarizeAtRatio: 0.2,
        targetRatio: 0.1,
        keepRecentTurns: 1,
        summaryMaxTokens: 128,
      },
    })

    let summaryRequestBody: unknown
    globalThis.fetch = ((_input, init) => {
      summaryRequestBody =
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined
      return Promise.resolve(
        Response.json({
          id: "summary-1",
          object: "chat.completion",
          created: 1,
          model: summarizerModel.id,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "The user discussed legacy setup and migration steps.",
              },
              logprobs: null,
              finish_reason: "stop",
            },
          ],
        }),
      )
    }) as typeof fetch

    const payload: ChatCompletionsPayload = {
      model: model.id,
      messages: [
        { role: "system", content: "follow the rules" },
        { role: "user", content: "old user detail ".repeat(90) },
        { role: "assistant", content: "old assistant answer ".repeat(40) },
        { role: "user", content: "latest request" },
      ],
    }

    const compressedPayload = await ensureChatPayloadWithinContextWindow(
      payload,
      model,
    )

    expect(summaryRequestBody).toMatchObject({
      model: summarizerModel.id,
      max_tokens: 256,
      stream: false,
      temperature: 0,
    })
    expect(compressedPayload.messages).toHaveLength(3)
    expect(compressedPayload.messages[0]).toEqual({
      role: "system",
      content: "follow the rules",
    })
    expect(compressedPayload.messages[1]?.role).toBe("assistant")
    expect(compressedPayload.messages[1]?.content).toContain(
      "Previous conversation summary",
    )
    expect(compressedPayload.messages[1]?.content).toContain(
      "legacy setup and migration steps",
    )
    expect(compressedPayload.messages[2]).toEqual({
      role: "user",
      content: "latest request",
    })
  })
})
