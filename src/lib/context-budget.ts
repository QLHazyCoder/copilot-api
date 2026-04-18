import type {
  AnthropicMessage,
  AnthropicMessagesPayload,
} from "~/routes/messages/anthropic-types"
import type {
  ChatCompletionsPayload,
  ContentPart,
  Message,
  Tool,
  ToolCall,
} from "~/services/copilot/create-chat-completions"
import type {
  FunctionTool,
  ResponseFunctionCallOutputItem,
  ResponseFunctionToolCallItem,
  ResponseInputContent,
  ResponseInputItem,
  ResponseInputMessage,
  ResponseInputReasoning,
  ResponsesPayload,
} from "~/services/copilot/create-responses"
import type { Model } from "~/services/copilot/get-models"

import { translateToOpenAI } from "~/routes/messages/non-stream-translation"

import { getConfig } from "./config"
import { ContextOverflowError } from "./copilot-error"
import { createHandlerLogger } from "./logger"
import { getPromptTokenCount } from "./tokenizer"

const logger = createHandlerLogger("context-budget")

const DEFAULT_OUTPUT_TOKEN_RESERVE = 4096

interface BudgetSourceCandidate {
  promptBudget: number
  source: string
}

interface PromptBudgetResolution {
  promptBudget: number
  source: string
  outputTokenReserve: number
}

interface TrimSegment<T> {
  items: Array<T>
  removable: boolean
}

interface TrimResult<TPayload> {
  payload: TPayload
  promptTokens: number
  promptBudget: number
  budgetSource: string
  outputTokenReserve: number
  removedSegments: number
}

interface ContextOverflowDetails {
  [key: string]: unknown
  budgetSource: string
  endpoint: string
  model: string
  outputTokenReserve: number
  promptBudget: number
  promptTokens: number
  removedSegments: number
}

export async function ensureChatPayloadWithinContextWindow(
  payload: ChatCompletionsPayload,
  model: Model | undefined,
): Promise<ChatCompletionsPayload> {
  if (!model) {
    return payload
  }

  const budget = resolvePromptBudget(model, payload.max_tokens ?? undefined)
  if (!budget) {
    return payload
  }

  const segments = buildChatTrimSegments(payload.messages)
  const result = await trimSegmentedPayload({
    buildPayload: (keptSegments) => ({
      ...payload,
      messages: keptSegments.flatMap((segment) => segment.items),
    }),
    budget,
    endpoint: "/chat/completions",
    estimatePromptTokens: (nextPayload) =>
      getPromptTokenCount(nextPayload, model),
    model,
    segments,
  })

  return result.payload
}

export async function ensureResponsesPayloadWithinContextWindow(
  payload: ResponsesPayload,
  model: Model | undefined,
): Promise<ResponsesPayload> {
  if (!model) {
    return payload
  }

  const budget = resolvePromptBudget(
    model,
    payload.max_output_tokens ?? undefined,
  )
  if (!budget) {
    return payload
  }

  const inputItems = Array.isArray(payload.input) ? payload.input : undefined
  const segments = inputItems ? buildResponsesTrimSegments(inputItems) : []

  const result = await trimSegmentedPayload({
    buildPayload: (keptSegments) => ({
      ...payload,
      ...(inputItems && {
        input: keptSegments.flatMap((segment) => segment.items),
      }),
    }),
    budget,
    endpoint: "/responses",
    estimatePromptTokens: async (nextPayload) =>
      getPromptTokenCount(
        buildSyntheticChatPayloadFromResponses(nextPayload),
        model,
      ),
    model,
    segments,
  })

  return result.payload
}

export async function ensureMessagesPayloadWithinContextWindow(
  payload: AnthropicMessagesPayload,
  model: Model | undefined,
): Promise<AnthropicMessagesPayload> {
  if (!model) {
    return payload
  }

  const budget = resolvePromptBudget(model, payload.max_tokens)
  if (!budget) {
    return payload
  }

  const result = await trimSegmentedPayload({
    buildPayload: (keptSegments) => ({
      ...payload,
      messages: keptSegments.flatMap((segment) => segment.items),
    }),
    budget,
    endpoint: "/v1/messages",
    estimatePromptTokens: async (nextPayload) =>
      getPromptTokenCount(translateToOpenAI(nextPayload), model),
    model,
    segments: buildAnthropicTrimSegments(payload.messages),
  })

  return result.payload
}

function resolvePromptBudget(
  model: Model,
  requestedOutputTokens: number | undefined,
): PromptBudgetResolution | null {
  const outputTokenReserve = resolveOutputTokenReserve(
    requestedOutputTokens,
    model.capabilities.limits.max_output_tokens,
  )

  const candidates = new Array<BudgetSourceCandidate>()
  const promptLimit = model.capabilities.limits.max_prompt_tokens
  if (
    typeof promptLimit === "number"
    && Number.isFinite(promptLimit)
    && promptLimit > 0
  ) {
    candidates.push({
      promptBudget: Math.floor(promptLimit),
      source: "model.capabilities.limits.max_prompt_tokens",
    })
  }

  const contextWindowLimit = model.capabilities.limits.max_context_window_tokens
  if (
    typeof contextWindowLimit === "number"
    && Number.isFinite(contextWindowLimit)
    && contextWindowLimit > 0
  ) {
    candidates.push({
      promptBudget: Math.max(
        Math.floor(contextWindowLimit) - outputTokenReserve,
        1,
      ),
      source:
        "model.capabilities.limits.max_context_window_tokens - outputReserve",
    })
  }

  const configuredContextWindow =
    getConfig().modelCardMetadata?.[model.id]?.contextWindowTokens
  if (
    typeof configuredContextWindow === "number"
    && Number.isFinite(configuredContextWindow)
    && configuredContextWindow > 0
  ) {
    candidates.push({
      promptBudget: Math.max(
        Math.floor(configuredContextWindow) - outputTokenReserve,
        1,
      ),
      source: "config.modelCardMetadata.contextWindowTokens - outputReserve",
    })
  }

  if (candidates.length === 0) {
    return null
  }

  const selectedCandidate = candidates.reduce((smallest, candidate) =>
    candidate.promptBudget < smallest.promptBudget ? candidate : smallest,
  )

  return {
    promptBudget: selectedCandidate.promptBudget,
    source: selectedCandidate.source,
    outputTokenReserve,
  }
}

function resolveOutputTokenReserve(
  requestedOutputTokens: number | undefined,
  modelOutputLimit: number | undefined,
): number {
  const normalizedRequested =
    (
      typeof requestedOutputTokens === "number"
      && Number.isFinite(requestedOutputTokens)
      && requestedOutputTokens > 0
    ) ?
      Math.floor(requestedOutputTokens)
    : undefined

  const normalizedModelLimit =
    (
      typeof modelOutputLimit === "number"
      && Number.isFinite(modelOutputLimit)
      && modelOutputLimit > 0
    ) ?
      Math.floor(modelOutputLimit)
    : undefined

  if (normalizedRequested !== undefined) {
    if (normalizedModelLimit !== undefined) {
      return Math.min(normalizedRequested, normalizedModelLimit)
    }

    return normalizedRequested
  }

  if (normalizedModelLimit !== undefined) {
    return Math.min(normalizedModelLimit, DEFAULT_OUTPUT_TOKEN_RESERVE)
  }

  return DEFAULT_OUTPUT_TOKEN_RESERVE
}

async function trimSegmentedPayload<TPayload, TItem>({
  buildPayload,
  budget,
  endpoint,
  estimatePromptTokens,
  model,
  segments,
}: {
  buildPayload: (segments: Array<TrimSegment<TItem>>) => TPayload
  budget: PromptBudgetResolution
  endpoint: string
  estimatePromptTokens: (payload: TPayload) => Promise<number>
  model: Model
  segments: Array<TrimSegment<TItem>>
}): Promise<TrimResult<TPayload>> {
  if (segments.length === 0) {
    const promptTokens = await estimatePromptTokens(buildPayload(segments))
    if (promptTokens > budget.promptBudget) {
      throwContextOverflow({
        budget,
        endpoint,
        model,
        promptTokens,
        removedSegments: 0,
      })
    }

    return {
      payload: buildPayload(segments),
      promptTokens,
      promptBudget: budget.promptBudget,
      budgetSource: budget.source,
      outputTokenReserve: budget.outputTokenReserve,
      removedSegments: 0,
    }
  }

  const kept = segments.map(() => true)
  let removedSegments = 0

  while (true) {
    const keptSegments = segments.filter((_, index) => kept[index])
    const candidatePayload = buildPayload(keptSegments)
    const promptTokens = await estimatePromptTokens(candidatePayload)

    if (promptTokens <= budget.promptBudget) {
      if (removedSegments > 0) {
        logger.info("Trimmed request context to fit model window", {
          budgetSource: budget.source,
          endpoint,
          model: model.id,
          outputTokenReserve: budget.outputTokenReserve,
          promptBudget: budget.promptBudget,
          promptTokens,
          removedSegments,
        })
      }

      return {
        payload: candidatePayload,
        promptTokens,
        promptBudget: budget.promptBudget,
        budgetSource: budget.source,
        outputTokenReserve: budget.outputTokenReserve,
        removedSegments,
      }
    }

    const removableIndex = kept.findIndex(
      (isKept, index) => isKept && segments[index]?.removable,
    )

    if (removableIndex === -1) {
      throwContextOverflow({
        budget,
        endpoint,
        model,
        promptTokens,
        removedSegments,
      })
    }

    kept[removableIndex] = false
    removedSegments++
  }
}

function throwContextOverflow({
  budget,
  endpoint,
  model,
  promptTokens,
  removedSegments,
}: {
  budget: PromptBudgetResolution
  endpoint: string
  model: Model
  promptTokens: number
  removedSegments: number
}): never {
  const details: ContextOverflowDetails = {
    budgetSource: budget.source,
    endpoint,
    model: model.id,
    outputTokenReserve: budget.outputTokenReserve,
    promptBudget: budget.promptBudget,
    promptTokens,
    removedSegments,
  }

  logger.warn("Request exceeds context window after trimming", details)

  throw new ContextOverflowError(
    `Input exceeds the context window for model ${model.id}. Estimated prompt tokens ${promptTokens} exceed prompt budget ${budget.promptBudget}.`,
    {
      details,
      statusCode: 400,
    },
  )
}

function buildChatTrimSegments(
  messages: Array<Message>,
): Array<TrimSegment<Message>> {
  const segments = new Array<TrimSegment<Message>>()
  let current = new Array<Message>()

  const flushCurrent = () => {
    if (current.length === 0) {
      return
    }

    segments.push({
      items: current,
      removable: true,
    })
    current = []
  }

  for (const message of messages) {
    if (message.role === "system" || message.role === "developer") {
      flushCurrent()
      segments.push({
        items: [message],
        removable: false,
      })
      continue
    }

    if (message.role === "user") {
      flushCurrent()
      current = [message]
      continue
    }

    current.push(message)
  }

  flushCurrent()
  protectNewestRemovableSegment(segments)
  return segments
}

function buildAnthropicTrimSegments(
  messages: Array<AnthropicMessage>,
): Array<TrimSegment<AnthropicMessage>> {
  const segments = new Array<TrimSegment<AnthropicMessage>>()
  let current = new Array<AnthropicMessage>()

  const flushCurrent = () => {
    if (current.length === 0) {
      return
    }

    segments.push({
      items: current,
      removable: true,
    })
    current = []
  }

  for (const message of messages) {
    if (message.role === "user") {
      flushCurrent()
      current = [message]
      continue
    }

    current.push(message)
  }

  flushCurrent()
  protectNewestRemovableSegment(segments)
  return segments
}

function buildResponsesTrimSegments(
  input: Array<ResponseInputItem>,
): Array<TrimSegment<ResponseInputItem>> {
  const segments = new Array<TrimSegment<ResponseInputItem>>()
  let current = new Array<ResponseInputItem>()

  const flushCurrent = () => {
    if (current.length === 0) {
      return
    }

    segments.push({
      items: current,
      removable: true,
    })
    current = []
  }

  for (const item of input) {
    if (isResponseMessage(item)) {
      if (item.role === "system" || item.role === "developer") {
        flushCurrent()
        segments.push({
          items: [item],
          removable: false,
        })
        continue
      }

      if (item.role === "user") {
        flushCurrent()
        current = [item]
        continue
      }
    }

    current.push(item)
  }

  flushCurrent()
  protectNewestRemovableSegment(segments)
  return segments
}

function protectNewestRemovableSegment<T>(
  segments: Array<TrimSegment<T>>,
): void {
  for (let index = segments.length - 1; index >= 0; index--) {
    if (segments[index]?.removable) {
      segments[index].removable = false
      return
    }
  }
}

function buildSyntheticChatPayloadFromResponses(
  payload: ResponsesPayload,
): ChatCompletionsPayload {
  const messages = new Array<Message>()

  if (
    typeof payload.instructions === "string"
    && payload.instructions.length > 0
  ) {
    messages.push({
      role: "system",
      content: payload.instructions,
    })
  }

  if (typeof payload.input === "string") {
    messages.push({
      role: "user",
      content: payload.input,
    })
  } else if (Array.isArray(payload.input)) {
    for (const item of payload.input) {
      appendResponseInputItemAsChatMessage(item, messages)
    }
  }

  return {
    model: payload.model,
    messages,
    ...(payload.tools && {
      tools: payload.tools.flatMap((tool) => convertResponsesToolToChat(tool)),
    }),
  }
}

function appendResponseInputItemAsChatMessage(
  item: ResponseInputItem,
  messages: Array<Message>,
): void {
  if (isResponseMessage(item)) {
    messages.push({
      role: item.role,
      content: convertResponsesMessageContentToChat(item.content, item.role),
    })
    return
  }

  if (isResponseFunctionCall(item)) {
    messages.push({
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: item.call_id,
          type: "function",
          function: {
            name: item.name,
            arguments: item.arguments,
          },
        } satisfies ToolCall,
      ],
    })
    return
  }

  if (isResponseFunctionCallOutput(item)) {
    messages.push({
      role: "tool",
      tool_call_id: item.call_id,
      content: convertResponseToolOutputToChat(item.output),
    })
    return
  }

  if (isResponseReasoning(item)) {
    messages.push({
      role: "assistant",
      content: null,
      reasoning_text: item.summary.map((entry) => entry.text).join("\n"),
      ...(item.encrypted_content && {
        reasoning_opaque:
          item.id ?
            `${item.encrypted_content}@${item.id}`
          : item.encrypted_content,
      }),
    })
    return
  }

  messages.push({
    role: "user",
    content: stringifyUnknown(item),
  })
}

function convertResponsesMessageContentToChat(
  content: ResponseInputMessage["content"],
  role: ResponseInputMessage["role"],
): string | Array<ContentPart> | null {
  if (typeof content === "string") {
    return content
  }

  if (!Array.isArray(content)) {
    return role === "assistant" ? null : ""
  }

  const parts = new Array<ContentPart>()

  for (const item of content) {
    if (isResponseImageContent(item)) {
      parts.push({
        type: "image_url",
        image_url: {
          url:
            item.image_url
            ?? (typeof item.file_id === "string" ? item.file_id : ""),
          detail: item.detail,
        },
      })
      continue
    }

    const text = extractResponseContentText(item)
    if (!text) {
      continue
    }

    parts.push({
      type: "text",
      text,
    })
  }

  if (parts.length === 0) {
    return role === "assistant" ? null : ""
  }

  return parts.some((part) => part.type === "image_url") ? parts : (
      parts
        .filter(
          (part): part is Extract<ContentPart, { type: "text" }> =>
            part.type === "text",
        )
        .map((part) => part.text)
        .join("\n")
    )
}

function convertResponseToolOutputToChat(
  output: ResponseFunctionCallOutputItem["output"],
): string | Array<ContentPart> | null {
  if (typeof output === "string") {
    return output
  }

  if (!Array.isArray(output)) {
    return null
  }

  const parts = new Array<ContentPart>()
  for (const item of output) {
    if (isResponseImageContent(item)) {
      parts.push({
        type: "image_url",
        image_url: {
          url:
            item.image_url
            ?? (typeof item.file_id === "string" ? item.file_id : ""),
          detail: item.detail,
        },
      })
      continue
    }

    const text = extractResponseContentText(item)
    if (text) {
      parts.push({
        type: "text",
        text,
      })
    }
  }

  if (parts.length === 0) {
    return null
  }

  return parts.some((part) => part.type === "image_url") ? parts : (
      parts
        .filter(
          (part): part is Extract<ContentPart, { type: "text" }> =>
            part.type === "text",
        )
        .map((part) => part.text)
        .join("\n")
    )
}

function convertResponsesToolToChat(tool: unknown): Array<Tool> {
  if (!isResponsesFunctionTool(tool)) {
    return []
  }

  return [
    {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description ?? undefined,
        parameters: tool.parameters ?? {},
      },
    },
  ]
}

function extractResponseContentText(content: ResponseInputContent): string {
  if (
    isObjectRecord(content)
    && "text" in content
    && typeof content.text === "string"
  ) {
    return content.text
  }

  return stringifyUnknown(content)
}

function isResponseMessage(item: unknown): item is ResponseInputMessage {
  return (
    isObjectRecord(item)
    && (!("type" in item) || item.type === "message")
    && "role" in item
    && (item.role === "user"
      || item.role === "assistant"
      || item.role === "system"
      || item.role === "developer")
  )
}

function isResponseFunctionCall(
  item: unknown,
): item is ResponseFunctionToolCallItem {
  return (
    isObjectRecord(item)
    && item.type === "function_call"
    && typeof item.call_id === "string"
    && typeof item.name === "string"
    && typeof item.arguments === "string"
  )
}

function isResponseFunctionCallOutput(
  item: unknown,
): item is ResponseFunctionCallOutputItem {
  return (
    isObjectRecord(item)
    && item.type === "function_call_output"
    && typeof item.call_id === "string"
  )
}

function isResponseReasoning(item: unknown): item is ResponseInputReasoning {
  return (
    isObjectRecord(item)
    && item.type === "reasoning"
    && Array.isArray(item.summary)
    && typeof item.encrypted_content === "string"
  )
}

function isResponseImageContent(
  content: unknown,
): content is Extract<ResponseInputContent, { type: "input_image" }> {
  return (
    isObjectRecord(content)
    && "type" in content
    && content.type === "input_image"
  )
}

function isResponsesFunctionTool(tool: unknown): tool is FunctionTool {
  return (
    isObjectRecord(tool)
    && "type" in tool
    && tool.type === "function"
    && "name" in tool
    && typeof tool.name === "string"
  )
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
