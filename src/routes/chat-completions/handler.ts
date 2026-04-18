import type { Context } from "hono"

import consola from "consola"
import { streamSSE, type SSEMessage } from "hono/streaming"

import { createHandlerLogger } from "~/lib/logger"
import {
  buildUnknownModelMessage,
  resolveModelRequest,
} from "~/lib/model-routing"
import { checkRateLimit } from "~/lib/rate-limit"
import { resolveConversationIdFromHeaders } from "~/lib/session"
import { state } from "~/lib/state"
import { getTokenCount } from "~/lib/tokenizer"
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

  const modelResolution = await resolveModelRequest(payload.model)
  payload = {
    ...payload,
    model: modelResolution.routedModel,
  }
  const conversationResolution = resolveConversationIdFromHeaders(c)
  const sessionId = conversationResolution.conversationId
  if (state.isDevelopment) {
    logger.info("Resolved conversation context for Chat request:", {
      source: conversationResolution.source,
      rawValue: conversationResolution.rawValue ?? null,
      conversationId: sessionId ?? null,
      xInteractionId: c.req.header("x-interaction-id") ?? null,
      xSessionId: c.req.header("x-session-id") ?? null,
    })
  }

  const selectedModel = modelResolution.selectedModel

  if (!selectedModel) {
    return c.json(
      {
        error: {
          message: buildUnknownModelMessage(modelResolution),
          type: "invalid_request_error",
          code: "model_not_supported",
        },
      },
      400,
    )
  }

  await logTokenCountIfPossible(payload, selectedModel)

  const fallbackResponse = await resolveFallbackResponse({
    c,
    payload,
    capabilities: modelResolution.capabilities,
    sessionId,
  })
  if (fallbackResponse) {
    return fallbackResponse
  }

  return await handleNativeChatCompletion(c, payload, sessionId)
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

const resolveFallbackResponse = async ({
  c,
  payload,
  capabilities,
  sessionId,
}: {
  c: Context
  payload: ChatCompletionsPayload
  capabilities: {
    supportsChatCompletions: boolean
    supportsResponses: boolean
    supportsMessages: boolean
    hasEndpointMetadata: boolean
  }
  sessionId: string | undefined
}): Promise<Response | undefined> => {
  if (!capabilities.supportsChatCompletions) {
    if (capabilities.supportsMessages) {
      return await handleMessagesFallback(c, payload, sessionId)
    }

    if (capabilities.supportsResponses) {
      return await handleResponsesFallback(c, payload, sessionId)
    }

    if (capabilities.hasEndpointMetadata) {
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
  sessionId: string | undefined,
) => {
  const response = await createChatCompletions(payload, { sessionId })

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
  sessionId: string | undefined,
) => {
  const responsesPayload = translateChatToResponsesPayload(payload)
  const { vision, initiator } = getResponsesRequestOptions(responsesPayload)

  const response = await createResponses(responsesPayload, {
    vision,
    initiator,
    sessionId,
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
  sessionId: string | undefined,
) => {
  const anthropicPayload = translateChatToAnthropicPayload(payload)
  const response = await createMessages(anthropicPayload, {
    sessionId,
    subagentMarker: null,
  })

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
