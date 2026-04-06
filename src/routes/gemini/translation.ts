import type {
  ChatCompletionChunk,
  ChatCompletionResponse,
  ChatCompletionsPayload,
  Message,
} from "~/services/copilot/create-chat-completions"

export interface GeminiTextPart {
  text?: string
}

export interface GeminiContent {
  role?: string
  parts?: Array<GeminiTextPart>
}

export interface GeminiGenerationConfig {
  temperature?: number
  topP?: number
  maxOutputTokens?: number
}

export interface GeminiGenerateContentRequest {
  contents?: Array<GeminiContent>
  generationConfig?: GeminiGenerationConfig
}

export interface GeminiUsageMetadata {
  promptTokenCount?: number
  candidatesTokenCount?: number
  totalTokenCount?: number
}

export interface GeminiCandidate {
  index: number
  content: {
    role: "model"
    parts: Array<{ text: string }>
  }
  finishReason?: GeminiFinishReason
}

export interface GeminiGenerateContentResponse {
  candidates: Array<GeminiCandidate>
  usageMetadata?: GeminiUsageMetadata
}

export type GeminiStreamChunkResponse = GeminiGenerateContentResponse

type ChatFinishReason =
  | "stop"
  | "length"
  | "tool_calls"
  | "content_filter"
  | null

type GeminiFinishReason = "STOP" | "MAX_TOKENS" | "SAFETY" | "OTHER"

export const buildChatPayloadFromGemini = (
  payload: GeminiGenerateContentRequest,
  model: string,
  stream: boolean,
): ChatCompletionsPayload => {
  const messages = toChatMessages(payload.contents ?? [])

  const chatPayload: ChatCompletionsPayload = {
    model,
    messages,
    stream,
  }

  const temperature = payload.generationConfig?.temperature
  if (isFiniteNumber(temperature)) {
    chatPayload.temperature = temperature
  }

  const topP = payload.generationConfig?.topP
  if (isFiniteNumber(topP)) {
    chatPayload.top_p = topP
  }

  const maxOutputTokens = payload.generationConfig?.maxOutputTokens
  if (isFiniteNumber(maxOutputTokens)) {
    chatPayload.max_tokens = maxOutputTokens
  }

  return chatPayload
}

export const hasAnyTextInput = (
  payload: GeminiGenerateContentRequest,
): boolean =>
  (payload.contents ?? []).some((content) =>
    (content.parts ?? []).some(
      (part) => typeof part.text === "string" && part.text.trim().length > 0,
    ),
  )

export const toGeminiNonStreamResponse = (
  response: ChatCompletionResponse,
): GeminiGenerateContentResponse => {
  const candidates = response.choices.map((choice) => ({
    index: choice.index,
    content: {
      role: "model" as const,
      parts: toGeminiTextParts(choice.message.content),
    },
    finishReason: mapFinishReason(choice.finish_reason),
  }))

  const usageMetadata = toGeminiUsage(response.usage)

  return {
    candidates,
    ...(usageMetadata && { usageMetadata }),
  }
}

export const toGeminiStreamChunkResponses = (
  chunk: ChatCompletionChunk,
): Array<GeminiStreamChunkResponse> => {
  const responses = new Array<GeminiStreamChunkResponse>()

  for (const choice of chunk.choices) {
    const content = choice.delta.content ?? ""
    if (content.length > 0) {
      responses.push({
        candidates: [
          {
            index: choice.index,
            content: {
              role: "model",
              parts: [{ text: content }],
            },
          },
        ],
      })
    }

    if (choice.finish_reason) {
      const usageMetadata = toGeminiUsage(chunk.usage)
      responses.push({
        candidates: [
          {
            index: choice.index,
            content: {
              role: "model",
              parts: [],
            },
            finishReason: mapFinishReason(choice.finish_reason),
          },
        ],
        ...(usageMetadata && { usageMetadata }),
      })
    }
  }

  return responses
}

const toChatMessages = (contents: Array<GeminiContent>): Array<Message> =>
  contents.flatMap((content) => {
    const text = (content.parts ?? [])
      .map((part) => (typeof part.text === "string" ? part.text.trim() : ""))
      .filter((partText) => partText.length > 0)
      .join("\n")

    if (!text) {
      return []
    }

    return [
      {
        role: toChatRole(content.role),
        content: text,
      },
    ]
  })

const toChatRole = (role: string | undefined): Message["role"] => {
  if (role === "model") {
    return "assistant"
  }

  if (role === "system") {
    return "system"
  }

  return "user"
}

const toGeminiTextParts = (content: string | null): Array<{ text: string }> => {
  if (!content) {
    return []
  }

  return [{ text: content }]
}

const toGeminiUsage = (
  usage:
    | {
        prompt_tokens: number
        completion_tokens?: number
        total_tokens: number
        prompt_tokens_details?: {
          cached_tokens: number
        }
      }
    | undefined,
): GeminiUsageMetadata | undefined => {
  if (!usage) {
    return undefined
  }

  return {
    promptTokenCount: usage.prompt_tokens,
    candidatesTokenCount: usage.completion_tokens,
    totalTokenCount: usage.total_tokens,
  }
}

const mapFinishReason = (
  reason: ChatFinishReason,
): GeminiFinishReason | undefined => {
  if (!reason) {
    return undefined
  }

  switch (reason) {
    case "stop":
    case "tool_calls": {
      return "STOP"
    }
    case "length": {
      return "MAX_TOKENS"
    }
    case "content_filter": {
      return "SAFETY"
    }
    default: {
      return "OTHER"
    }
  }
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)
