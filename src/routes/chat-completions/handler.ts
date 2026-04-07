import type { Context } from "hono"

import consola from "consola"
import { streamSSE, type SSEMessage } from "hono/streaming"

import { getMappedModel } from "~/lib/config"
import { createHandlerLogger } from "~/lib/logger"
import { checkRateLimit } from "~/lib/rate-limit"
import { state } from "~/lib/state"
import { getTokenCount } from "~/lib/tokenizer"
import { isNullish } from "~/lib/utils"
import {
  type AnthropicResponse,
  type AnthropicStreamEventData,
} from "~/routes/messages/anthropic-types"
import {
  createChatCompletions,
  type ChatCompletionResponse,
  type ChatCompletionsPayload,
} from "~/services/copilot/create-chat-completions"
import { createMessages } from "~/services/copilot/create-messages"
import {
  createResponses,
  type ResponsesResult,
  type ResponseStreamEvent,
} from "~/services/copilot/create-responses"

import { getResponsesRequestOptions } from "../responses/utils"
import {
  createAnthropicStreamToChatState,
  translateAnthropicStreamEventToChatChunks,
  translateAnthropicToChatCompletion,
  translateChatToAnthropicPayload,
} from "./messages-fallback"
import {
  createResponsesStreamToChatState,
  getChatFallbackCapabilities,
  translateChatToResponsesPayload,
  translateResponsesStreamEventToChatChunks,
  translateResponsesToChatCompletion,
} from "./responses-fallback"

const logger = createHandlerLogger("chat-completions-handler")
type SelectedModel = NonNullable<typeof state.models>["data"][number]

export async function handleCompletion(c: Context) {
  await checkRateLimit(state)

  let payload = await c.req.json<ChatCompletionsPayload>()
  consola.info(`[Request] model: ${payload.model}`)
  logger.debug("Request payload:", JSON.stringify(payload).slice(-400))

  payload = applyModelMappingAndReasoning(payload)

  const selectedModel = state.models?.data.find(
    (model) => model.id === payload.model,
  )

  await logTokenCountIfPossible(payload, selectedModel)
  payload = applyDefaultMaxTokens(payload, selectedModel)

  const fallbackResponse = await resolveFallbackResponse(
    c,
    payload,
    selectedModel,
  )
  if (fallbackResponse) {
    return fallbackResponse
  }

  return await handleNativeChatCompletion(c, payload)
}

const applyModelMappingAndReasoning = (
  payload: ChatCompletionsPayload,
): ChatCompletionsPayload => {
  const mappedModel = getMappedModel(payload.model)
  const mappedPayload = {
    ...payload,
    model: mappedModel,
  }

  return mappedPayload
}

const logTokenCountIfPossible = async (
  payload: ChatCompletionsPayload,
  selectedModel: SelectedModel | undefined,
): Promise<void> => {
  try {
    if (!selectedModel) {
      logger.warn("No model selected, skipping token count calculation")
      return
    }

    const tokenCount = await getTokenCount(payload, selectedModel)
    logger.info("Current token count:", tokenCount)
  } catch (error) {
    logger.warn("Failed to calculate token count:", error)
  }
}

const applyDefaultMaxTokens = (
  payload: ChatCompletionsPayload,
  selectedModel: SelectedModel | undefined,
): ChatCompletionsPayload => {
  if (!isNullish(payload.max_tokens)) {
    return payload
  }

  const nextPayload = {
    ...payload,
    max_tokens: selectedModel?.capabilities.limits.max_output_tokens,
  }
  logger.debug("Set max_tokens to:", JSON.stringify(nextPayload.max_tokens))
  return nextPayload
}

const resolveFallbackResponse = async (
  c: Context,
  payload: ChatCompletionsPayload,
  selectedModel: SelectedModel | undefined,
): Promise<Response | undefined> => {
  if (!selectedModel) {
    return undefined
  }

  const fallbackCapabilities = getChatFallbackCapabilities(
    selectedModel.supported_endpoints,
  )

  if (!fallbackCapabilities.supportsChatCompletions) {
    if (fallbackCapabilities.supportsMessages) {
      return await handleMessagesFallback(c, payload)
    }

    if (fallbackCapabilities.supportsResponses) {
      return await handleResponsesFallback(c, payload)
    }

    if (fallbackCapabilities.hasEndpointMetadata) {
      return c.json(
        {
          error: {
            message:
              "This model does not support the chat/completions endpoint. Please use /v1/messages or /v1/responses.",
            type: "invalid_request_error",
          },
        },
        400,
      )
    }
  }

  return undefined
}

const handleNativeChatCompletion = async (
  c: Context,
  payload: ChatCompletionsPayload,
) => {
  const response = await createChatCompletions(payload)

  if (isNonStreaming(response)) {
    response.created = getEpochSec()
    logger.debug("Non-streaming response:", JSON.stringify(response))
    return c.json(response)
  }

  logger.debug("Streaming response")
  return streamSSE(c, async (stream) => {
    for await (const chunk of response) {
      logger.debug("Streaming chunk:", JSON.stringify(chunk))
      await stream.writeSSE(chunk as SSEMessage)
    }
  })
}

const isNonStreaming = (
  response: Awaited<ReturnType<typeof createChatCompletions>>,
): response is ChatCompletionResponse => Object.hasOwn(response, "choices")

const isAsyncIterable = <T>(value: unknown): value is AsyncIterable<T> =>
  Boolean(value)
  && typeof (value as AsyncIterable<T>)[Symbol.asyncIterator] === "function"

const handleResponsesFallback = async (
  c: Context,
  payload: ChatCompletionsPayload,
) => {
  const responsesPayload = translateChatToResponsesPayload(payload)
  const { vision, initiator } = getResponsesRequestOptions(responsesPayload)

  const response = await createResponses(responsesPayload, {
    vision,
    initiator,
  })

  if (payload.stream && isAsyncIterable(response)) {
    logger.debug("Streaming response via Responses fallback")
    return streamSSE(c, async (stream) => {
      const streamState = createResponsesStreamToChatState()

      for await (const rawChunk of response) {
        const data = (rawChunk as { data?: string }).data
        if (!data) {
          continue
        }

        const rawEvent = JSON.parse(data) as ResponseStreamEvent
        const chunks = translateResponsesStreamEventToChatChunks(
          rawEvent,
          streamState,
        )

        for (const chunk of chunks) {
          await stream.writeSSE({
            data: JSON.stringify(chunk),
          })
        }

        if (
          rawEvent.type === "response.completed"
          || rawEvent.type === "response.incomplete"
        ) {
          await stream.writeSSE({
            data: "[DONE]",
          })
          break
        }
      }
    })
  }

  logger.debug("Non-streaming response via Responses fallback")
  const chatResponse = translateResponsesToChatCompletion(
    response as ResponsesResult,
  )
  return c.json(chatResponse)
}

const handleMessagesFallback = async (
  c: Context,
  payload: ChatCompletionsPayload,
) => {
  const anthropicPayload = translateChatToAnthropicPayload(payload)
  const response = await createMessages(anthropicPayload)

  if (payload.stream && isAsyncIterable(response)) {
    logger.debug("Streaming response via Messages fallback")
    return streamSSE(c, async (stream) => {
      const streamState = createAnthropicStreamToChatState()

      for await (const rawChunk of response) {
        const data = (rawChunk as { data?: string }).data
        if (!data) {
          continue
        }

        const rawEvent = JSON.parse(data) as AnthropicStreamEventData
        const chunks = translateAnthropicStreamEventToChatChunks(
          rawEvent,
          streamState,
        )

        for (const chunk of chunks) {
          await stream.writeSSE({
            data: JSON.stringify(chunk),
          })
        }

        if (rawEvent.type === "message_stop") {
          await stream.writeSSE({
            data: "[DONE]",
          })
          break
        }
      }
    })
  }

  logger.debug("Non-streaming response via Messages fallback")
  const chatResponse = translateAnthropicToChatCompletion(
    response as AnthropicResponse,
  )
  return c.json(chatResponse)
}

const getEpochSec = () => Math.round(Date.now() / 1000)
