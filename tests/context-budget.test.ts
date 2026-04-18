import { describe, expect, test } from "bun:test"

import type { AnthropicMessagesPayload } from "~/routes/messages/anthropic-types"
import type { ChatCompletionsPayload } from "~/services/copilot/create-chat-completions"
import type { ResponsesPayload } from "~/services/copilot/create-responses"
import type { Model, ModelsResponse } from "~/services/copilot/get-models"

import {
  ensureChatPayloadWithinContextWindow,
  ensureMessagesPayloadWithinContextWindow,
  ensureResponsesPayloadWithinContextWindow,
} from "~/lib/context-budget"
import { ContextOverflowError } from "~/lib/copilot-error"
import { state } from "~/lib/state"

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
})
