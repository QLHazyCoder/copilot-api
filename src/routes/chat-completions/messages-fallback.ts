import {
  type AnthropicAssistantContentBlock,
  type AnthropicAssistantMessage,
  type AnthropicContentBlockDeltaEvent,
  type AnthropicContentBlockStartEvent,
  type AnthropicImageBlock,
  type AnthropicMessageDeltaEvent,
  type AnthropicMessageStartEvent,
  type AnthropicMessagesPayload,
  type AnthropicResponse,
  type AnthropicStreamEventData,
  type AnthropicTextBlock,
  type AnthropicTool,
  type AnthropicUserContentBlock,
} from "~/routes/messages/anthropic-types"
import {
  type ChatCompletionChunk,
  type ChatCompletionResponse,
  type ChatCompletionsPayload,
  type ContentPart,
  type Message,
  type ToolCall,
} from "~/services/copilot/create-chat-completions"

const getEpochSec = () => Math.round(Date.now() / 1000)

export interface AnthropicStreamToChatState {
  id: string
  model: string
  created: number
  roleEmitted: boolean
  toolCallsByBlockIndex: Map<number, { id: string; name: string }>
}

type ChatUsage = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  prompt_tokens_details?: {
    cached_tokens: number
  }
}

export const createAnthropicStreamToChatState =
  (): AnthropicStreamToChatState => ({
    id: "chatcmpl_fallback",
    model: "unknown",
    created: getEpochSec(),
    roleEmitted: false,
    toolCallsByBlockIndex: new Map(),
  })

export const translateChatToAnthropicPayload = (
  payload: ChatCompletionsPayload,
): AnthropicMessagesPayload => {
  const systemBlocks: Array<AnthropicTextBlock> = []
  const messages = new Array<AnthropicMessagesPayload["messages"][number]>()

  for (const message of payload.messages) {
    appendAnthropicMessageFromOpenAIMessage(message, messages, systemBlocks)
  }

  return {
    model: payload.model,
    messages,
    max_tokens: payload.max_tokens ?? 4096,
    ...(systemBlocks.length > 0 && {
      system: systemBlocks,
    }),
    ...(payload.user && {
      metadata: {
        user_id: payload.user,
      },
    }),
    ...(typeof payload.temperature === "number" && {
      temperature: payload.temperature,
    }),
    ...(typeof payload.top_p === "number" && {
      top_p: payload.top_p,
    }),
    ...(payload.stream !== undefined && {
      stream: Boolean(payload.stream),
    }),
    ...(payload.stop && {
      stop_sequences:
        typeof payload.stop === "string" ? [payload.stop] : payload.stop,
    }),
    ...(payload.tools && {
      tools: mapOpenAIToolsToAnthropic(payload.tools),
    }),
    ...(payload.tool_choice && {
      tool_choice: mapOpenAIToolChoiceToAnthropic(payload.tool_choice),
    }),
  }
}

const appendAnthropicMessageFromOpenAIMessage = (
  message: Message,
  messages: Array<AnthropicMessagesPayload["messages"][number]>,
  systemBlocks: Array<AnthropicTextBlock>,
): void => {
  switch (message.role) {
    case "system":
    case "developer": {
      const text = normalizeMessageContentToText(message.content)
      if (text) {
        systemBlocks.push({ type: "text", text })
      }
      break
    }

    case "user": {
      const userContent = mapOpenAIUserContentToAnthropic(message.content)
      messages.push({
        role: "user",
        content: userContent,
      })
      break
    }

    case "assistant": {
      const assistantMessage = mapOpenAIAssistantMessageToAnthropic(message)
      messages.push(assistantMessage)
      break
    }

    case "tool": {
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: message.tool_call_id ?? "unknown",
            content: normalizeMessageContentToText(message.content),
          },
        ],
      })
      break
    }

    default: {
      break
    }
  }
}

const mapOpenAIUserContentToAnthropic = (
  content: Message["content"],
): string | Array<AnthropicUserContentBlock> => {
  if (typeof content === "string") {
    return content
  }

  if (!Array.isArray(content)) {
    return ""
  }

  const blocks = new Array<AnthropicUserContentBlock>()

  for (const part of content) {
    if (part.type === "text") {
      blocks.push({ type: "text", text: part.text })
      continue
    }

    const imageBlock = convertDataUrlToAnthropicImage(part.image_url.url)
    if (imageBlock) {
      blocks.push(imageBlock)
    }
  }

  if (blocks.length === 0) {
    return ""
  }

  return blocks
}

const mapOpenAIAssistantMessageToAnthropic = (
  message: Message,
): AnthropicAssistantMessage => {
  const content = new Array<AnthropicAssistantContentBlock>()

  if (message.reasoning_text || message.reasoning_opaque) {
    content.push({
      type: "thinking",
      thinking: message.reasoning_text ?? "",
      signature: message.reasoning_opaque ?? "",
    })
  }

  const textContent = normalizeMessageContentToText(message.content)
  if (textContent) {
    content.push({
      type: "text",
      text: textContent,
    })
  }

  if (Array.isArray(message.tool_calls)) {
    for (const toolCall of message.tool_calls) {
      content.push({
        type: "tool_use",
        id: toolCall.id,
        name: toolCall.function.name,
        input: parseToolArguments(toolCall.function.arguments),
      })
    }
  }

  return {
    role: "assistant",
    content,
  }
}

const mapOpenAIToolsToAnthropic = (
  tools: NonNullable<ChatCompletionsPayload["tools"]>,
): Array<AnthropicTool> =>
  tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }))

const mapOpenAIToolChoiceToAnthropic = (
  toolChoice: NonNullable<ChatCompletionsPayload["tool_choice"]>,
): AnthropicMessagesPayload["tool_choice"] => {
  if (toolChoice === "none") {
    return { type: "none" }
  }

  if (toolChoice === "required") {
    return { type: "any" }
  }

  if (toolChoice === "auto") {
    return { type: "auto" }
  }

  if (toolChoice.function.name) {
    return {
      type: "tool",
      name: toolChoice.function.name,
    }
  }

  return { type: "auto" }
}

export const translateAnthropicToChatCompletion = (
  response: AnthropicResponse,
): ChatCompletionResponse => {
  const textParts = new Array<string>()
  const reasoningParts = new Array<string>()
  let reasoningOpaque: string | undefined
  const toolCalls = new Array<ToolCall>()

  for (const block of response.content) {
    if (block.type === "text") {
      textParts.push(block.text)
      continue
    }

    if (block.type === "thinking") {
      if (block.thinking) {
        reasoningParts.push(block.thinking)
      }
      if (block.signature) {
        reasoningOpaque = block.signature
      }
      continue
    }

    toolCalls.push({
      id: block.id,
      type: "function",
      function: {
        name: block.name,
        arguments: JSON.stringify(block.input),
      },
    })
  }

  const promptTokens =
    response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0)
  const completionTokens = response.usage.output_tokens

  return {
    id: response.id,
    object: "chat.completion",
    created: getEpochSec(),
    model: response.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: textParts.join(""),
          ...(toolCalls.length > 0 && {
            tool_calls: toolCalls,
          }),
          ...(reasoningParts.length > 0 && {
            reasoning_text: reasoningParts.join("\n"),
          }),
          ...(reasoningOpaque && {
            reasoning_opaque: reasoningOpaque,
          }),
        },
        logprobs: null,
        finish_reason: mapAnthropicStopReasonToOpenAI(response.stop_reason),
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      ...(response.usage.cache_read_input_tokens !== undefined && {
        prompt_tokens_details: {
          cached_tokens: response.usage.cache_read_input_tokens,
        },
      }),
    },
  }
}

export const translateAnthropicStreamEventToChatChunks = (
  rawEvent: AnthropicStreamEventData,
  state: AnthropicStreamToChatState,
): Array<ChatCompletionChunk> => {
  switch (rawEvent.type) {
    case "message_start": {
      return handleMessageStart(rawEvent, state)
    }

    case "content_block_start": {
      return handleContentBlockStart(rawEvent, state)
    }

    case "content_block_delta": {
      return handleContentBlockDelta(rawEvent, state)
    }

    case "message_delta": {
      return handleMessageDelta(rawEvent, state)
    }

    default: {
      return []
    }
  }
}

const handleMessageStart = (
  rawEvent: AnthropicMessageStartEvent,
  state: AnthropicStreamToChatState,
): Array<ChatCompletionChunk> => {
  state.id = rawEvent.message.id
  state.model = rawEvent.message.model
  state.created = getEpochSec()

  if (state.roleEmitted) {
    return []
  }

  state.roleEmitted = true

  return [
    createChatChunk({
      state,
      delta: {
        role: "assistant",
      },
    }),
  ]
}

const handleContentBlockStart = (
  rawEvent: AnthropicContentBlockStartEvent,
  state: AnthropicStreamToChatState,
): Array<ChatCompletionChunk> => {
  if (rawEvent.content_block.type !== "tool_use") {
    return []
  }

  state.toolCallsByBlockIndex.set(rawEvent.index, {
    id: rawEvent.content_block.id,
    name: rawEvent.content_block.name,
  })

  return [
    createChatChunk({
      state,
      delta: {
        tool_calls: [
          {
            index: rawEvent.index,
            id: rawEvent.content_block.id,
            type: "function",
            function: {
              name: rawEvent.content_block.name,
              arguments: "",
            },
          },
        ],
      },
    }),
  ]
}

const handleContentBlockDelta = (
  rawEvent: AnthropicContentBlockDeltaEvent,
  state: AnthropicStreamToChatState,
): Array<ChatCompletionChunk> => {
  switch (rawEvent.delta.type) {
    case "text_delta": {
      return [
        createChatChunk({
          state,
          delta: {
            content: rawEvent.delta.text,
          },
        }),
      ]
    }

    case "thinking_delta": {
      return [
        createChatChunk({
          state,
          delta: {
            reasoning_text: rawEvent.delta.thinking,
          },
        }),
      ]
    }

    case "signature_delta": {
      return [
        createChatChunk({
          state,
          delta: {
            reasoning_opaque: rawEvent.delta.signature,
          },
        }),
      ]
    }

    case "input_json_delta": {
      const toolCall = state.toolCallsByBlockIndex.get(rawEvent.index)
      return [
        createChatChunk({
          state,
          delta: {
            tool_calls: [
              {
                index: rawEvent.index,
                id: toolCall?.id,
                type: "function",
                function: {
                  name: toolCall?.name,
                  arguments: rawEvent.delta.partial_json,
                },
              },
            ],
          },
        }),
      ]
    }

    default: {
      return []
    }
  }
}

const handleMessageDelta = (
  rawEvent: AnthropicMessageDeltaEvent,
  state: AnthropicStreamToChatState,
): Array<ChatCompletionChunk> => {
  if (!rawEvent.delta.stop_reason) {
    return []
  }

  const promptTokens =
    rawEvent.usage?.input_tokens ?? rawEvent.usage?.cache_read_input_tokens ?? 0
  const completionTokens = rawEvent.usage?.output_tokens ?? 0

  return [
    createChatChunk({
      state,
      delta: {},
      finishReason: mapAnthropicStopReasonToOpenAI(rawEvent.delta.stop_reason),
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
        ...(rawEvent.usage?.cache_read_input_tokens !== undefined && {
          prompt_tokens_details: {
            cached_tokens: rawEvent.usage.cache_read_input_tokens,
          },
        }),
      },
    }),
  ]
}

interface CreateChatChunkOptions {
  state: AnthropicStreamToChatState
  delta: ChatCompletionChunk["choices"][number]["delta"]
  finishReason?: ChatCompletionChunk["choices"][number]["finish_reason"]
  usage?: ChatUsage
}

const createChatChunk = ({
  state,
  delta,
  finishReason = null,
  usage,
}: CreateChatChunkOptions): ChatCompletionChunk => ({
  id: state.id,
  object: "chat.completion.chunk",
  created: state.created,
  model: state.model,
  choices: [
    {
      index: 0,
      delta,
      finish_reason: finishReason,
      logprobs: null,
    },
  ],
  ...(usage && { usage }),
})

const mapAnthropicStopReasonToOpenAI = (
  stopReason: AnthropicResponse["stop_reason"],
): "stop" | "length" | "tool_calls" | "content_filter" => {
  if (stopReason === "max_tokens") {
    return "length"
  }

  if (stopReason === "tool_use") {
    return "tool_calls"
  }

  if (stopReason === "refusal") {
    return "content_filter"
  }

  return "stop"
}

const normalizeMessageContentToText = (content: Message["content"]): string => {
  if (typeof content === "string") {
    return content
  }

  if (!Array.isArray(content)) {
    return ""
  }

  return content
    .filter(
      (part): part is Extract<ContentPart, { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("\n")
}

const parseToolArguments = (argumentsText: string): Record<string, unknown> => {
  if (!argumentsText) {
    return {}
  }

  try {
    const parsed = JSON.parse(argumentsText) as unknown
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }

    if (Array.isArray(parsed)) {
      return { arguments: parsed }
    }
  } catch {
    return { raw_arguments: argumentsText }
  }

  return {}
}

const convertDataUrlToAnthropicImage = (
  url: string,
): AnthropicImageBlock | null => {
  const dataUrlMatch = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(url)
  if (!dataUrlMatch) {
    return null
  }

  const mediaType = dataUrlMatch[1]
  const data = dataUrlMatch[2]

  if (
    mediaType !== "image/jpeg"
    && mediaType !== "image/png"
    && mediaType !== "image/gif"
    && mediaType !== "image/webp"
  ) {
    return null
  }

  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mediaType,
      data,
    },
  }
}
