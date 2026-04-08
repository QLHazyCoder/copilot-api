import type { Context } from "hono"

import { streamSSE, type SSEMessage } from "hono/streaming"

import { getMappedModel } from "~/lib/config"
import { createHandlerLogger } from "~/lib/logger"
import { checkRateLimit } from "~/lib/rate-limit"
import { resolveConversationIdFromHeaders } from "~/lib/session"
import { state } from "~/lib/state"
import { cacheModels } from "~/lib/utils"
import { getChatFallbackCapabilities } from "~/routes/chat-completions/responses-fallback"
import {
  createChatCompletions,
  type ChatCompletionChunk,
  type ChatCompletionResponse,
} from "~/services/copilot/create-chat-completions"

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

  const mappedModel = getMappedModel(parsedRequest.model)
  const selectedModel = await resolveModel(mappedModel)

  if (!selectedModel) {
    return c.json(
      {
        error: {
          message: "Unknown model. Please switch to a supported chat model.",
          type: "invalid_request_error",
        },
      },
      400,
    )
  }

  const capabilities = getChatFallbackCapabilities(
    selectedModel.supported_endpoints,
  )
  if (!capabilities.supportsChatCompletions) {
    return c.json(
      {
        error: {
          message:
            "This model does not support chat/completions. Please switch model.",
          type: "invalid_request_error",
        },
      },
      400,
    )
  }

  const chatPayload = buildChatPayloadFromGemini(
    payload,
    mappedModel,
    parsedRequest.stream,
  )

  if (parsedRequest.stream) {
    return await handleStreamingResponse(c, chatPayload, sessionId)
  }

  const response = await createChatCompletions(chatPayload, { sessionId })
  const geminiResponse = toGeminiNonStreamResponse(
    response as ChatCompletionResponse,
  )
  return c.json(geminiResponse)
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

const resolveModel = async (model: string) => {
  if (!state.models) {
    await cacheModels()
  }

  return state.models?.data.find((item) => item.id === model)
}

const handleStreamingResponse = async (
  c: Context,
  chatPayload: Parameters<typeof createChatCompletions>[0],
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
      const geminiChunkResponses = toGeminiStreamChunkResponses(parsedChunk)

      for (const geminiChunkResponse of geminiChunkResponses) {
        await stream.writeSSE({
          data: JSON.stringify(geminiChunkResponse),
        } satisfies SSEMessage)
      }
    }
  })
}

const isAsyncIterable = <T>(value: unknown): value is AsyncIterable<T> =>
  Boolean(value)
  && typeof (value as AsyncIterable<T>)[Symbol.asyncIterator] === "function"
