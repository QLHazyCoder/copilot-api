import {
  type ChatCompletionChunk,
  type ChatCompletionResponse,
  type ChatCompletionsPayload,
  type ContentPart,
  type Message,
  type ToolCall,
} from "~/services/copilot/create-chat-completions"
import {
  type ResponseCreatedEvent,
  type ResponseFunctionCallArgumentsDeltaEvent,
  type ResponseInputContent,
  type ResponseInputItem,
  type ResponseInputMessage,
  type ResponseOutputItemAddedEvent,
  type ResponseOutputItemDoneEvent,
  type ResponseOutputItem,
  type ResponseOutputReasoning,
  type ResponsesPayload,
  type ResponsesResult,
  type ResponseReasoningSummaryTextDeltaEvent,
  type ResponseStreamEvent,
  type ResponseTextDeltaEvent,
  type ResponseUsage,
  type Tool,
} from "~/services/copilot/create-responses"

const CHAT_COMPLETIONS_ENDPOINT = "/chat/completions"
const CHAT_COMPLETIONS_V1_ENDPOINT = "/v1/chat/completions"
const RESPONSES_ENDPOINT = "/responses"
const RESPONSES_V1_ENDPOINT = "/v1/responses"
const MESSAGES_ENDPOINT = "/v1/messages"
const MESSAGES_LEGACY_ENDPOINT = "/messages"

export interface ChatFallbackCapabilities {
  supportsChatCompletions: boolean
  supportsResponses: boolean
  supportsMessages: boolean
  hasEndpointMetadata: boolean
}

export interface ResponsesStreamToChatState {
  id?: string
  model?: string
  created?: number
  roleEmitted: boolean
  functionCallsByOutputIndex: Map<number, { callId: string; name: string }>
}

type ChatUsage = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  prompt_tokens_details?: {
    cached_tokens: number
  }
}

export const createResponsesStreamToChatState =
  (): ResponsesStreamToChatState => ({
    roleEmitted: false,
    functionCallsByOutputIndex: new Map(),
  })

export const getChatFallbackCapabilities = (
  supportedEndpoints: Array<string> | undefined,
): ChatFallbackCapabilities => {
  const endpoints =
    Array.isArray(supportedEndpoints) ?
      supportedEndpoints
        .map((endpoint) => normalizeEndpointPath(endpoint))
        .filter((endpoint): endpoint is string => endpoint.length > 0)
    : []
  const endpointSet = new Set(endpoints)

  return {
    supportsChatCompletions:
      endpointSet.has(CHAT_COMPLETIONS_ENDPOINT)
      || endpointSet.has(CHAT_COMPLETIONS_V1_ENDPOINT),
    supportsResponses:
      endpointSet.has(RESPONSES_ENDPOINT)
      || endpointSet.has(RESPONSES_V1_ENDPOINT),
    supportsMessages:
      endpointSet.has(MESSAGES_ENDPOINT)
      || endpointSet.has(MESSAGES_LEGACY_ENDPOINT),
    hasEndpointMetadata: endpoints.length > 0,
  }
}

const normalizeEndpointPath = (endpoint: string): string => {
  const normalized = endpoint.trim().toLowerCase()
  if (!normalized) {
    return ""
  }

  const pathname =
    normalized.startsWith("http://") || normalized.startsWith("https://") ?
      extractPathnameFromUrl(normalized)
    : normalized

  const withLeadingSlash = pathname.startsWith("/") ? pathname : `/${pathname}`

  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith("/")) {
    return withLeadingSlash.slice(0, -1)
  }

  return withLeadingSlash
}

const extractPathnameFromUrl = (input: string): string => {
  try {
    return new URL(input).pathname
  } catch {
    return input
  }
}

export const translateChatToResponsesPayload = (
  payload: ChatCompletionsPayload,
): ResponsesPayload => {
  const input: Array<ResponseInputItem> = []

  for (const message of payload.messages) {
    input.push(...translateMessage(message))
  }

  return {
    model: payload.model,
    input,
    tools: translateTools(payload.tools),
    tool_choice: translateToolChoice(payload.tool_choice),
    temperature: payload.temperature ?? null,
    top_p: payload.top_p ?? null,
    max_output_tokens: payload.max_tokens ?? null,
    stream: payload.stream ?? null,
    metadata: payload.user ? { user: payload.user } : null,
    reasoning:
      payload.reasoning_effort ?
        {
          effort: payload.reasoning_effort,
        }
      : null,
    parallel_tool_calls: true,
    store: false,
  }
}

const translateMessage = (message: Message): Array<ResponseInputItem> => {
  switch (message.role) {
    case "system":
    case "developer":
    case "user": {
      return [
        {
          type: "message",
          role: message.role,
          content: translateMessageContent(message.content, message.role),
        },
      ]
    }

    case "assistant": {
      const items: Array<ResponseInputItem> = []

      if (message.content !== null) {
        items.push({
          type: "message",
          role: "assistant",
          content: translateMessageContent(message.content, "assistant"),
        })
      }

      if (message.reasoning_opaque) {
        items.push({
          type: "reasoning",
          id: getReasoningId(message.reasoning_opaque),
          encrypted_content: getReasoningEncryptedContent(
            message.reasoning_opaque,
          ),
          summary:
            message.reasoning_text ?
              [
                {
                  type: "summary_text",
                  text: message.reasoning_text,
                },
              ]
            : [],
        })
      }

      if (Array.isArray(message.tool_calls)) {
        for (const toolCall of message.tool_calls) {
          items.push({
            type: "function_call",
            call_id: toolCall.id,
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
            status: "completed",
          })
        }
      }

      return items
    }

    case "tool": {
      return [
        {
          type: "function_call_output",
          call_id: message.tool_call_id ?? "unknown",
          output: normalizeToolOutput(message.content),
          status: "completed",
        },
      ]
    }

    default: {
      return []
    }
  }
}

const translateMessageContent = (
  content: Message["content"],
  role: ResponseInputMessage["role"],
): string | Array<ResponseInputContent> => {
  if (typeof content === "string") {
    return content
  }

  if (!Array.isArray(content)) {
    return role === "assistant" ? [] : ""
  }

  const parts: Array<ResponseInputContent> = []

  for (const part of content) {
    if (part.type === "text") {
      parts.push({
        type: role === "assistant" ? "output_text" : "input_text",
        text: part.text,
      })
      continue
    }

    if (role === "assistant") {
      continue
    }

    parts.push({
      type: "input_image",
      image_url: part.image_url.url,
      detail: part.image_url.detail ?? "auto",
    })
  }

  return parts
}

const translateTools = (
  tools: ChatCompletionsPayload["tools"],
): Array<Tool> | null => {
  if (!Array.isArray(tools) || tools.length === 0) {
    return null
  }

  return tools.map((tool) => ({
    type: "function",
    name: tool.function.name,
    description: tool.function.description ?? null,
    parameters: tool.function.parameters,
    strict: false,
  }))
}

const translateToolChoice = (
  toolChoice: ChatCompletionsPayload["tool_choice"],
): ResponsesPayload["tool_choice"] => {
  if (!toolChoice) {
    return "auto"
  }

  if (typeof toolChoice === "object" && toolChoice.function.name) {
    return {
      type: "function",
      name: toolChoice.function.name,
    }
  }

  if (toolChoice === "required") {
    return "required"
  }

  if (toolChoice === "none") {
    return "none"
  }

  return "auto"
}

const normalizeToolOutput = (content: Message["content"]): string => {
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

const getReasoningId = (reasoningOpaque: string): string | undefined => {
  const [_, id] = reasoningOpaque.split("@")
  return id || undefined
}

const getReasoningEncryptedContent = (reasoningOpaque: string): string => {
  const [encryptedContent] = reasoningOpaque.split("@")
  return encryptedContent
}

export const translateResponsesToChatCompletion = (
  result: ResponsesResult,
): ChatCompletionResponse => {
  const text = extractTextFromResponsesOutput(result.output, result.output_text)
  const toolCalls = extractToolCallsFromResponsesOutput(result.output)
  const reasoning = extractReasoningFromResponsesOutput(result.output)
  const usage = mapUsageToChatUsage(result.usage)

  return {
    id: result.id,
    object: "chat.completion",
    created: result.created_at,
    model: result.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text,
          ...(toolCalls.length > 0 && {
            tool_calls: toolCalls,
          }),
          ...(reasoning.reasoningText && {
            reasoning_text: reasoning.reasoningText,
          }),
          ...(reasoning.reasoningOpaque && {
            reasoning_opaque: reasoning.reasoningOpaque,
          }),
        },
        logprobs: null,
        finish_reason: mapResponsesFinishReasonToChat(result),
      },
    ],
    ...(usage && { usage }),
  }
}

export const translateResponsesStreamEventToChatChunks = (
  rawEvent: ResponseStreamEvent,
  state: ResponsesStreamToChatState,
): Array<ChatCompletionChunk> => {
  switch (rawEvent.type) {
    case "response.created": {
      return handleResponseCreated(rawEvent, state)
    }

    case "response.output_text.delta": {
      return handleResponseOutputTextDelta(rawEvent, state)
    }

    case "response.reasoning_summary_text.delta": {
      return handleResponseReasoningDelta(rawEvent, state)
    }

    case "response.output_item.added": {
      return handleResponseOutputItemAdded(rawEvent, state)
    }

    case "response.function_call_arguments.delta": {
      return handleResponseFunctionCallArgumentsDelta(rawEvent, state)
    }

    case "response.output_item.done": {
      return handleResponseOutputItemDone(rawEvent, state)
    }

    case "response.completed":
    case "response.incomplete": {
      return [
        createChatChunk({
          state,
          delta: {},
          finishReason: mapResponsesFinishReasonToChat(rawEvent.response),
          usage: mapUsageToChatUsage(rawEvent.response.usage),
        }),
      ]
    }

    default: {
      return []
    }
  }
}

const handleResponseCreated = (
  rawEvent: ResponseCreatedEvent,
  state: ResponsesStreamToChatState,
): Array<ChatCompletionChunk> => {
  state.id = rawEvent.response.id
  state.model = rawEvent.response.model
  state.created = rawEvent.response.created_at

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

const handleResponseOutputTextDelta = (
  rawEvent: ResponseTextDeltaEvent,
  state: ResponsesStreamToChatState,
): Array<ChatCompletionChunk> => {
  if (!rawEvent.delta) {
    return []
  }

  return [
    createChatChunk({
      state,
      delta: {
        content: rawEvent.delta,
      },
    }),
  ]
}

const handleResponseReasoningDelta = (
  rawEvent: ResponseReasoningSummaryTextDeltaEvent,
  state: ResponsesStreamToChatState,
): Array<ChatCompletionChunk> => {
  if (!rawEvent.delta) {
    return []
  }

  return [
    createChatChunk({
      state,
      delta: {
        reasoning_text: rawEvent.delta,
      },
    }),
  ]
}

const handleResponseOutputItemAdded = (
  rawEvent: ResponseOutputItemAddedEvent,
  state: ResponsesStreamToChatState,
): Array<ChatCompletionChunk> => {
  if (rawEvent.item.type !== "function_call") {
    return []
  }

  const callId = rawEvent.item.call_id
  const name = rawEvent.item.name
  state.functionCallsByOutputIndex.set(rawEvent.output_index, {
    callId,
    name,
  })

  return [
    createChatChunk({
      state,
      delta: {
        tool_calls: [
          {
            index: rawEvent.output_index,
            id: callId,
            type: "function",
            function: {
              name,
              arguments: rawEvent.item.arguments || "",
            },
          },
        ],
      },
    }),
  ]
}

const handleResponseFunctionCallArgumentsDelta = (
  rawEvent: ResponseFunctionCallArgumentsDeltaEvent,
  state: ResponsesStreamToChatState,
): Array<ChatCompletionChunk> => {
  const call = state.functionCallsByOutputIndex.get(rawEvent.output_index)

  return [
    createChatChunk({
      state,
      delta: {
        tool_calls: [
          {
            index: rawEvent.output_index,
            id: call?.callId,
            type: "function",
            function: {
              name: call?.name,
              arguments: rawEvent.delta,
            },
          },
        ],
      },
    }),
  ]
}

const handleResponseOutputItemDone = (
  rawEvent: ResponseOutputItemDoneEvent,
  state: ResponsesStreamToChatState,
): Array<ChatCompletionChunk> => {
  if (rawEvent.item.type !== "reasoning") {
    return []
  }

  if (!rawEvent.item.encrypted_content) {
    return []
  }

  return [
    createChatChunk({
      state,
      delta: {
        reasoning_opaque: `${rawEvent.item.encrypted_content}@${rawEvent.item.id}`,
      },
    }),
  ]
}

interface CreateChatChunkOptions {
  state: ResponsesStreamToChatState
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
  id: state.id ?? "chatcmpl_fallback",
  object: "chat.completion.chunk",
  created: state.created ?? Math.round(Date.now() / 1000),
  model: state.model ?? "unknown",
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

const extractTextFromResponsesOutput = (
  output: Array<ResponseOutputItem>,
  outputText: string,
): string => {
  const textParts: Array<string> = []

  for (const item of output) {
    if (item.type !== "message" || !Array.isArray(item.content)) {
      continue
    }

    for (const block of item.content) {
      if (
        "type" in block
        && block.type === "output_text"
        && typeof block.text === "string"
      ) {
        textParts.push(block.text)
      }
    }
  }

  if (textParts.length > 0) {
    return textParts.join("")
  }

  return outputText
}

const extractToolCallsFromResponsesOutput = (
  output: Array<ResponseOutputItem>,
): Array<ToolCall> => {
  const toolCalls: Array<ToolCall> = []

  for (const item of output) {
    if (item.type !== "function_call") {
      continue
    }

    toolCalls.push({
      id: item.call_id,
      type: "function",
      function: {
        name: item.name,
        arguments: item.arguments,
      },
    })
  }

  return toolCalls
}

const extractReasoningFromResponsesOutput = (
  output: Array<ResponseOutputItem>,
): {
  reasoningText?: string
  reasoningOpaque?: string
} => {
  const summaryText: Array<string> = []
  let reasoningOpaque: string | undefined

  for (const item of output) {
    if (item.type !== "reasoning") {
      continue
    }

    summaryText.push(extractReasoningSummaryText(item))

    if (item.encrypted_content) {
      reasoningOpaque = `${item.encrypted_content}@${item.id}`
    }
  }

  const reasoningText = summaryText.join("\n").trim()

  return {
    ...(reasoningText && { reasoningText }),
    ...(reasoningOpaque && { reasoningOpaque }),
  }
}

const extractReasoningSummaryText = (item: ResponseOutputReasoning): string => {
  if (!Array.isArray(item.summary)) {
    return ""
  }

  return item.summary
    .map((block) => (typeof block.text === "string" ? block.text : ""))
    .join("")
}

const mapResponsesFinishReasonToChat = (
  result: Pick<ResponsesResult, "status" | "incomplete_details" | "output">,
): "stop" | "length" | "tool_calls" | "content_filter" => {
  if (result.status === "completed") {
    const hasToolCalls = result.output.some(
      (item) => item.type === "function_call",
    )
    return hasToolCalls ? "tool_calls" : "stop"
  }

  if (result.status === "incomplete") {
    if (result.incomplete_details?.reason === "max_output_tokens") {
      return "length"
    }

    if (result.incomplete_details?.reason === "content_filter") {
      return "content_filter"
    }
  }

  return "stop"
}

const mapUsageToChatUsage = (
  usage: ResponseUsage | null | undefined,
): ChatUsage | undefined => {
  if (!usage) {
    return undefined
  }

  return {
    prompt_tokens: usage.input_tokens,
    completion_tokens: usage.output_tokens ?? 0,
    total_tokens: usage.total_tokens,
    ...(usage.input_tokens_details?.cached_tokens !== undefined && {
      prompt_tokens_details: {
        cached_tokens: usage.input_tokens_details.cached_tokens,
      },
    }),
  }
}
