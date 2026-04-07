import type { Context } from "hono"

import consola from "consola"

import { getAnthropicApiKey, getMappedModel } from "~/lib/config"
import { state } from "~/lib/state"
import { getTokenCount } from "~/lib/tokenizer"

import { type AnthropicMessagesPayload } from "./anthropic-types"
import { translateToOpenAI } from "./non-stream-translation"
import { sanitizeAnthropicPayload } from "./sanitize"

const ANTHROPIC_COUNT_TOKENS_URL =
  "https://api.anthropic.com/v1/messages/count_tokens"
const ANTHROPIC_VERSION = "2023-06-01"
const ANTHROPIC_TOKEN_COUNTING_BETA = "token-counting-2024-11-01"

interface AnthropicCountTokensResponse {
  input_tokens: number
}

const normalizeClaudeModelForAnthropic = (model: string): string =>
  model.replaceAll(".", "-")

const countTokensViaAnthropic = async ({
  payload,
  mappedModel,
  apiKey,
}: {
  payload: AnthropicMessagesPayload
  mappedModel: string
  apiKey: string
}): Promise<number | null> => {
  if (!mappedModel.startsWith("claude")) {
    return null
  }

  const anthropicPayload: AnthropicMessagesPayload = {
    ...payload,
    model: normalizeClaudeModelForAnthropic(mappedModel),
  }

  try {
    const response = await fetch(ANTHROPIC_COUNT_TOKENS_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-beta": ANTHROPIC_TOKEN_COUNTING_BETA,
      },
      body: JSON.stringify(anthropicPayload),
    })

    if (!response.ok) {
      consola.warn(
        "Anthropic count_tokens failed:",
        response.status,
        await response.text().catch(() => ""),
        "- fallback to local estimation",
      )
      return null
    }

    const result =
      (await response.json()) as Partial<AnthropicCountTokensResponse>
    const inputTokens = result.input_tokens
    if (typeof inputTokens !== "number" || !Number.isFinite(inputTokens)) {
      consola.warn(
        "Anthropic count_tokens returned invalid payload, fallback to local estimation",
      )
      return null
    }

    return inputTokens
  } catch (error) {
    consola.warn(
      "Anthropic count_tokens request error, fallback to local estimation",
      error,
    )
    return null
  }
}

/**
 * Handles token counting for Anthropic messages
 */
export async function handleCountTokens(c: Context) {
  try {
    const anthropicBeta = c.req.header("anthropic-beta")

    const anthropicPayload = await c.req.json<AnthropicMessagesPayload>()
    sanitizeAnthropicPayload(anthropicPayload)

    // Apply model mapping so count_tokens uses the same resolved model as /v1/messages
    const mappedModel = getMappedModel(anthropicPayload.model)
    anthropicPayload.model = mappedModel

    const anthropicApiKey = getAnthropicApiKey()
    if (anthropicApiKey) {
      const tokenCountViaAnthropic = await countTokensViaAnthropic({
        payload: anthropicPayload,
        mappedModel,
        apiKey: anthropicApiKey,
      })

      if (tokenCountViaAnthropic !== null) {
        consola.info("Token count (Anthropic API):", tokenCountViaAnthropic)
        return c.json({
          input_tokens: tokenCountViaAnthropic,
        })
      }
    }

    const openAIPayload = translateToOpenAI(anthropicPayload)

    const selectedModel = state.models?.data.find(
      (model) => model.id === mappedModel,
    )

    if (!selectedModel) {
      consola.warn("Model not found, returning default token count")
      return c.json({
        input_tokens: 1,
      })
    }

    const tokenCount = await getTokenCount(openAIPayload, selectedModel)

    if (anthropicPayload.tools && anthropicPayload.tools.length > 0) {
      let addToolSystemPromptCount = false
      if (anthropicBeta) {
        const toolsLength = anthropicPayload.tools.length
        addToolSystemPromptCount = !anthropicPayload.tools.some(
          (tool) =>
            tool.name.startsWith("mcp__")
            || (tool.name === "Skill" && toolsLength === 1),
        )
      }
      if (addToolSystemPromptCount) {
        if (mappedModel.startsWith("claude")) {
          // https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview#pricing
          tokenCount.input = tokenCount.input + 346
        } else if (mappedModel.startsWith("grok")) {
          tokenCount.input = tokenCount.input + 120
        }
      }
    }

    let finalTokenCount = tokenCount.input + tokenCount.output
    if (mappedModel.startsWith("claude")) {
      finalTokenCount = Math.round(finalTokenCount * 1.15)
    }

    consola.info("Token count:", finalTokenCount)

    return c.json({
      input_tokens: finalTokenCount,
    })
  } catch (error) {
    consola.error("Error counting tokens:", error)
    return c.json({
      input_tokens: 1,
    })
  }
}
