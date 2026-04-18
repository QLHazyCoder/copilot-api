import type { Context } from "hono"

import { streamSSE, type SSEMessage } from "hono/streaming"

import type {
  AnthropicResponse,
  AnthropicStreamEventData,
} from "~/routes/messages/anthropic-types"

import { createHandlerLogger } from "~/lib/logger"
import {
  buildUnknownModelMessage,
  resolveModelRequest,
} from "~/lib/model-routing"
import { checkRateLimit } from "~/lib/rate-limit"
import { resolveConversationIdFromHeaders } from "~/lib/session"
import { state } from "~/lib/state"
import {
  createAnthropicStreamToChatState,
  translateAnthropicStreamEventToChatChunks,
  translateAnthropicToChatCompletion,
  translateChatToAnthropicPayload,
} from "~/routes/chat-completions/messages-fallback"
import {
  createResponsesStreamToChatState,
  translateChatToResponsesPayload,
  translateResponsesStreamEventToChatChunks,
  translateResponsesToChatCompletion,
} from "~/routes/chat-completions/responses-fallback"
import { getResponsesRequestOptions } from "~/routes/responses/utils"
import {
  createChatCompletions,
  type ChatCompletionChunk,
  type ChatCompletionResponse,
  type ChatCompletionsPayload,
} from "~/services/copilot/create-chat-completions"
import { createMessages } from "~/services/copilot/create-messages"
import {
  createResponses,
  type ResponsesResult,
  type ResponseStreamEvent,
} from "~/services/copilot/create-responses"

import {
  buildChatPayloadFromGemini,
  hasAnyTextInput,
  toGeminiNonStreamResponse,
  toGeminiStreamChunkResponses,
  type GeminiGenerateContentRequest,
} from "./translation"

const logger = createHandlerLogger("gemini-handler")

interface ParsedGeminiRequest {
  model: string
  stream: boolean
}

export const handleGeminiCompletion = async (c: Context) => {
  await checkRateLimit(state)

  const parsedRequest = parseGeminiRequestPath(c.req.path)
  if (!parsedRequest) {
    return c.json(
      {
        error: {
          message: "Unsupported Gemini endpoint.",
          type: "invalid_request_error",
        },
      },
      404,
    )
  }

  const payload = await c.req.json<GeminiGenerateContentRequest>()
  const conversationResolution = resolveConversationIdFromHeaders(c)
  const sessionId = conversationResolution.conversationId
  if (state.isDevelopment) {
    logger.info("Resolved conversation context for Gemini request:", {
      source: conversationResolution.source,
      rawValue: conversationResolution.rawValue ?? null,
      conversationId: sessionId ?? null,
      xInteractionId: c.req.header("x-interaction-id") ?? null,
      xSessionId: c.req.header("x-session-id") ?? null,
    })
  }
  if (!hasAnyTextInput(payload)) {
    return c.json(
      {
        error: {
          message: "Invalid Gemini request: contents.parts.text is required.",
          type: "invalid_request_error",
        },
      },
      400,
    )
  }

  const modelResolution = await resolveModelRequest(parsedRequest.model)
  if (!modelResolution.selectedModel) {
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

  const chatPayload = buildChatPayloadFromGemini(
    payload,
    modelResolution.routedModel,
    parsedRequest.stream,
  )

  if (
    !modelResolution.capabilities.hasEndpointMetadata
    || modelResolution.capabilities.supportsChatCompletions
  ) {
    return await handleChatResponse(c, chatPayload, sessionId)
  }

  if (modelResolution.capabilities.supportsMessages) {
    return await handleMessagesFallback(c, chatPayload, sessionId)
  }

  if (modelResolution.capabilities.supportsResponses) {
    return await handleResponsesFallback(c, chatPayload, sessionId)
  }

  return c.json(
    {
      error: {
        message:
          "This model does not support Gemini-compatible requests. Please switch model.",
        type: "invalid_request_error",
      },
    },
    400,
  )
}

const parseGeminiRequestPath = (path: string): ParsedGeminiRequest | null => {
  const match =
    /^\/v1beta\/models\/([^/]+):(generateContent|streamGenerateContent)$/.exec(
      path,
    )

  if (!match) {
    return null
  }

  const [, encodedModel, action] = match
  return {
    model: decodeURIComponent(encodedModel),
    stream: action === "streamGenerateContent",
  }
}

const handleChatResponse = async (
  c: Context,
  chatPayload: ChatCompletionsPayload,
  sessionId: string | undefined,
) => {
  if (chatPayload.stream) {
    return await handleStreamingChatResponse(c, chatPayload, sessionId)
  }

  const response = await createChatCompletions(chatPayload, { sessionId })
  const geminiResponse = toGeminiNonStreamResponse(
    response as ChatCompletionResponse,
  )
  return c.json(geminiResponse)
}

const handleMessagesFallback = async (
  c: Context,
  chatPayload: ChatCompletionsPayload,
  sessionId: string | undefined,
) => {
  const anthropicPayload = translateChatToAnthropicPayload(chatPayload)
  const response = await createMessages(anthropicPayload, {
    sessionId,
    subagentMarker: null,
  })

  if (chatPayload.stream && isAsyncIterable(response)) {
    return streamSSE(c, async (stream) => {
      const streamState = createAnthropicStreamToChatState()

      for await (const rawChunk of response) {
        const data = (rawChunk as { data?: string }).data
        if (!data) {
          continue
        }

        const rawEvent = JSON.parse(data) as AnthropicStreamEventData
        const chatChunks = translateAnthropicStreamEventToChatChunks(
          rawEvent,
          streamState,
        )
        await writeGeminiChatChunks(stream, chatChunks)

        if (rawEvent.type === "message_stop") {
          break
        }
      }
    })
  }

  const geminiResponse = toGeminiNonStreamResponse(
    translateAnthropicToChatCompletion(response as AnthropicResponse),
  )
  return c.json(geminiResponse)
}

const handleResponsesFallback = async (
  c: Context,
  chatPayload: ChatCompletionsPayload,
  sessionId: string | undefined,
) => {
  const responsesPayload = translateChatToResponsesPayload(chatPayload)
  const { vision, initiator } = getResponsesRequestOptions(responsesPayload)
  const response = await createResponses(responsesPayload, {
    vision,
    initiator,
    sessionId,
  })

  if (chatPayload.stream && isAsyncIterable(response)) {
    return streamSSE(c, async (stream) => {
      const streamState = createResponsesStreamToChatState()

      for await (const rawChunk of response) {
        const data = (rawChunk as { data?: string }).data
        if (!data) {
          continue
        }

        const rawEvent = JSON.parse(data) as ResponseStreamEvent
        const chatChunks = translateResponsesStreamEventToChatChunks(
          rawEvent,
          streamState,
        )
        await writeGeminiChatChunks(stream, chatChunks)

        if (
          rawEvent.type === "response.completed"
          || rawEvent.type === "response.incomplete"
        ) {
          break
        }
      }
    })
  }

  const geminiResponse = toGeminiNonStreamResponse(
    translateResponsesToChatCompletion(response as ResponsesResult),
  )
  return c.json(geminiResponse)
}

const handleStreamingChatResponse = async (
  c: Context,
  chatPayload: ChatCompletionsPayload,
  sessionId: string | undefined,
) => {
  const response = await createChatCompletions(chatPayload, { sessionId })

  if (!isAsyncIterable(response)) {
    logger.error(
      "Expected streaming iterable response for Gemini stream request",
    )
    return c.json(
      {
        error: {
          message: "Expected streaming response but got non-stream response.",
          type: "invalid_request_error",
        },
      },
      500,
    )
  }

  return streamSSE(c, async (stream) => {
    for await (const chunk of response) {
      const data = (chunk as { data?: string }).data
      if (!data || data === "[DONE]") {
        continue
      }

      const parsedChunk = JSON.parse(data) as ChatCompletionChunk
      await writeGeminiChatChunks(stream, [parsedChunk])
    }
  })
}

const writeGeminiChatChunks = async (
  stream: {
    writeSSE: (message: SSEMessage) => Promise<void>
  },
  chatChunks: Array<ChatCompletionChunk>,
) => {
  for (const chatChunk of chatChunks) {
    const geminiChunkResponses = toGeminiStreamChunkResponses(chatChunk)

    for (const geminiChunkResponse of geminiChunkResponses) {
      await stream.writeSSE({
        data: JSON.stringify(geminiChunkResponse),
      } satisfies SSEMessage)
    }
  }
}

const isAsyncIterable = <T>(value: unknown): value is AsyncIterable<T> =>
  Boolean(value)
  && typeof (value as AsyncIterable<T>)[Symbol.asyncIterator] === "function"
