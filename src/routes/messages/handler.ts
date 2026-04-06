import type { Context } from "hono"

import consola from "consola"
import { streamSSE } from "hono/streaming"

import { getMappedModel, getSmallModel } from "~/lib/config"
import { createHandlerLogger } from "~/lib/logger"
import { checkRateLimit } from "~/lib/rate-limit"
import { getRootSessionId } from "~/lib/session"
import { state } from "~/lib/state"
import {
  buildErrorEvent,
  createResponsesStreamState,
  translateResponsesStreamEvent,
} from "~/routes/messages/responses-stream-translation"
import {
  translateAnthropicMessagesToResponsesPayload,
  translateResponsesResultToAnthropic,
} from "~/routes/messages/responses-translation"
import { getResponsesRequestOptions } from "~/routes/responses/utils"
import {
  createChatCompletions,
  type ChatCompletionChunk,
  type ChatCompletionResponse,
} from "~/services/copilot/create-chat-completions"
import { createMessages } from "~/services/copilot/create-messages"
import {
  createResponses,
  type ResponsesResult,
  type ResponseStreamEvent,
} from "~/services/copilot/create-responses"

import {
  type AnthropicMessagesPayload,
  type AnthropicStreamState,
  type AnthropicTextBlock,
  type AnthropicToolResultBlock,
} from "./anthropic-types"
import {
  translateToAnthropic,
  translateToOpenAI,
} from "./non-stream-translation"
import { sanitizeAnthropicPayload } from "./sanitize"
import { translateChunkToAnthropicEvents } from "./stream-translation"
import {
  parseSubagentMarkerFromFirstUser,
  type SubagentMarker,
} from "./subagent-marker"

const logger = createHandlerLogger("messages-handler")

export async function handleCompletion(c: Context) {
  await checkRateLimit(state)

  const anthropicPayload = await c.req.json<AnthropicMessagesPayload>()
  consola.info(`[Request] model: ${anthropicPayload.model}`)
  logger.debug("Anthropic request payload:", JSON.stringify(anthropicPayload))

  sanitizeAnthropicPayload(anthropicPayload)

  const subagentMarker = parseSubagentMarkerFromFirstUser(anthropicPayload)
  if (subagentMarker) {
    logger.debug("Detected Subagent marker:", JSON.stringify(subagentMarker))
  }

  const sessionId = getRootSessionId(anthropicPayload, c)
  logger.debug("Extracted session ID:", sessionId)

  // fix claude code 2.0.28+ warmup request consume premium request, forcing small model if no tools are used
  // set "CLAUDE_CODE_SUBAGENT_MODEL": "you small model" also can avoid this
  const anthropicBeta = c.req.header("anthropic-beta")
  logger.debug("Anthropic Beta header:", anthropicBeta)
  const noTools = !anthropicPayload.tools || anthropicPayload.tools.length === 0
  if (anthropicBeta && noTools) {
    anthropicPayload.model = getSmallModel()
  }

  anthropicPayload.model = getMappedModel(anthropicPayload.model)

  const initiator = inferAnthropicInitiatorFromLastMessage(anthropicPayload)

  // Merge tool_result and text blocks into tool_result to avoid consuming premium requests
  // (caused by skill invocations, edit hooks, plan or to do reminders)
  // e.g. {"role":"user","content":[{"type":"tool_result","content":"Launching skill: xxx"},{"type":"text","text":"xxx"}]}
  // not only for claude, but also for opencode
  mergeToolResultForClaude(anthropicPayload)
  sanitizeOrphanToolResults(anthropicPayload)

  if (shouldUseMessagesApi(anthropicPayload.model)) {
    return await handleWithMessagesApi(c, anthropicPayload, {
      anthropicBetaHeader: anthropicBeta,
      initiatorOverride: initiator,
      subagentMarker,
      sessionId,
    })
  }

  if (shouldUseResponsesApi(anthropicPayload.model)) {
    return await handleWithResponsesApi(c, {
      anthropicPayload,
      initiatorOverride: initiator,
      subagentOptions: {
        subagentMarker,
        sessionId,
      },
    })
  }

  return await handleWithChatCompletions(c, {
    anthropicPayload,
    initiator,
    subagentOptions: {
      subagentMarker,
      sessionId,
    },
  })
}

const RESPONSES_ENDPOINT = "/responses"
const MESSAGES_ENDPOINT = "/v1/messages"

export const inferAnthropicInitiatorFromLastMessage = (
  anthropicPayload: AnthropicMessagesPayload,
): "agent" | "user" => {
  const lastMessage = anthropicPayload.messages.at(-1)
  if (!lastMessage || lastMessage.role !== "user") {
    return "user"
  }

  if (!Array.isArray(lastMessage.content)) {
    return "user"
  }

  const hasToolResult = lastMessage.content.some(
    (block) => block.type === "tool_result",
  )
  if (!hasToolResult) {
    return "user"
  }

  const hasUnsupportedBlock = lastMessage.content.some(
    (block) => block.type !== "tool_result" && block.type !== "text",
  )
  return hasUnsupportedBlock ? "user" : "agent"
}

interface SubagentOptions {
  subagentMarker: SubagentMarker | null
  sessionId: string | undefined
}

const handleWithChatCompletions = async (
  c: Context,
  {
    anthropicPayload,
    initiator,
    subagentOptions,
  }: {
    anthropicPayload: AnthropicMessagesPayload
    initiator: "agent" | "user"
    subagentOptions: SubagentOptions
  },
) => {
  const openAIPayload = translateToOpenAI(anthropicPayload)
  logger.debug(
    "Translated OpenAI request payload:",
    JSON.stringify(openAIPayload),
  )

  const response = await createChatCompletions(openAIPayload, {
    initiator,
    subagentMarker: subagentOptions.subagentMarker,
    sessionId: subagentOptions.sessionId,
  })

  if (isNonStreaming(response)) {
    logger.debug(
      "Non-streaming response from Copilot:",
      JSON.stringify(response),
    )
    const anthropicResponse = translateToAnthropic(response)
    logger.debug(
      "Translated Anthropic response:",
      JSON.stringify(anthropicResponse),
    )
    return c.json(anthropicResponse)
  }

  logger.debug("Streaming response from Copilot")
  return streamSSE(c, async (stream) => {
    const streamState: AnthropicStreamState = {
      messageStartSent: false,
      contentBlockIndex: 0,
      contentBlockOpen: false,
      toolCalls: {},
      thinkingBlockOpen: false,
    }

    for await (const rawEvent of response) {
      logger.debug("Copilot raw stream event:", JSON.stringify(rawEvent))
      if (rawEvent.data === "[DONE]") {
        break
      }

      if (!rawEvent.data) {
        continue
      }

      const chunk = JSON.parse(rawEvent.data) as ChatCompletionChunk
      const events = translateChunkToAnthropicEvents(chunk, streamState)

      for (const event of events) {
        logger.debug("Translated Anthropic event:", JSON.stringify(event))
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
        })
      }
    }
  })
}

const handleWithResponsesApi = async (
  c: Context,
  {
    anthropicPayload,
    initiatorOverride,
    subagentOptions,
  }: {
    anthropicPayload: AnthropicMessagesPayload
    initiatorOverride: "agent" | "user"
    subagentOptions: SubagentOptions
  },
) => {
  const responsesPayload =
    translateAnthropicMessagesToResponsesPayload(anthropicPayload)
  logger.debug(
    "Translated Responses payload:",
    JSON.stringify(responsesPayload),
  )

  const { vision } = getResponsesRequestOptions(responsesPayload)
  const response = await createResponses(responsesPayload, {
    vision,
    initiator: initiatorOverride,
    subagentMarker: subagentOptions.subagentMarker,
    sessionId: subagentOptions.sessionId,
  })

  if (responsesPayload.stream && isAsyncIterable(response)) {
    logger.debug("Streaming response from Copilot (Responses API)")
    return streamSSE(c, async (stream) => {
      const streamState = createResponsesStreamState()

      for await (const chunk of response) {
        const eventName = chunk.event
        if (eventName === "ping") {
          await stream.writeSSE({ event: "ping", data: "" })
          continue
        }

        const data = chunk.data
        if (!data) {
          continue
        }

        logger.debug("Responses raw stream event:", data)

        const events = translateResponsesStreamEvent(
          JSON.parse(data) as ResponseStreamEvent,
          streamState,
        )
        for (const event of events) {
          const eventData = JSON.stringify(event)
          logger.debug("Translated Anthropic event:", eventData)
          await stream.writeSSE({
            event: event.type,
            data: eventData,
          })
        }

        if (streamState.messageCompleted) {
          logger.debug("Message completed, ending stream")
          break
        }
      }

      if (!streamState.messageCompleted) {
        logger.warn(
          "Responses stream ended without completion; sending error event",
        )
        const errorEvent = buildErrorEvent(
          "Responses stream ended without completion",
        )
        await stream.writeSSE({
          event: errorEvent.type,
          data: JSON.stringify(errorEvent),
        })
      }
    })
  }

  logger.debug(
    "Non-streaming Responses result:",
    JSON.stringify(response).slice(-400),
  )
  const anthropicResponse = translateResponsesResultToAnthropic(
    response as ResponsesResult,
  )
  logger.debug(
    "Translated Anthropic response:",
    JSON.stringify(anthropicResponse),
  )
  return c.json(anthropicResponse)
}

const stripThinkingBlocks = (payload: AnthropicMessagesPayload): void => {
  for (const msg of payload.messages) {
    if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue
    msg.content = msg.content.filter((block) => block.type !== "thinking")
  }
}

const handleWithMessagesApi = async (
  c: Context,
  anthropicPayload: AnthropicMessagesPayload,
  {
    anthropicBetaHeader,
    initiatorOverride,
    subagentMarker,
    sessionId,
  }: {
    anthropicBetaHeader: string | undefined
    initiatorOverride: "agent" | "user"
    subagentMarker: SubagentMarker | null
    sessionId: string | undefined
  },
) => {
  stripThinkingBlocks(anthropicPayload)
  const response = await createMessages(anthropicPayload, {
    anthropicBetaHeader,
    initiatorOverride,
    subagentMarker,
    sessionId,
  })

  if (isAsyncIterable(response)) {
    logger.debug("Streaming response from Copilot (Messages API)")
    return streamSSE(c, async (stream) => {
      for await (const event of response) {
        const eventName = event.event
        const data = event.data ?? ""
        logger.debug("Messages raw stream event:", data)
        await stream.writeSSE({
          event: eventName,
          data,
        })
      }
    })
  }

  logger.debug(
    "Non-streaming Messages result:",
    JSON.stringify(response).slice(-400),
  )
  return c.json(response)
}

const shouldUseResponsesApi = (modelId: string): boolean => {
  const selectedModel = state.models?.data.find((model) => model.id === modelId)
  return (
    selectedModel?.supported_endpoints?.includes(RESPONSES_ENDPOINT) ?? false
  )
}

const shouldUseMessagesApi = (modelId: string): boolean => {
  const selectedModel = state.models?.data.find((model) => model.id === modelId)
  return (
    selectedModel?.supported_endpoints?.includes(MESSAGES_ENDPOINT) ?? false
  )
}

const isNonStreaming = (
  response: Awaited<ReturnType<typeof createChatCompletions>>,
): response is ChatCompletionResponse => Object.hasOwn(response, "choices")

const isAsyncIterable = <T>(value: unknown): value is AsyncIterable<T> =>
  Boolean(value)
  && typeof (value as AsyncIterable<T>)[Symbol.asyncIterator] === "function"

const mergeContentWithText = (
  tr: AnthropicToolResultBlock,
  textBlock: AnthropicTextBlock,
): AnthropicToolResultBlock => {
  if (typeof tr.content === "string") {
    return { ...tr, content: `${tr.content}\n\n${textBlock.text}` }
  }
  return {
    ...tr,
    content: [...tr.content, textBlock],
  }
}

const mergeContentWithTexts = (
  tr: AnthropicToolResultBlock,
  textBlocks: Array<AnthropicTextBlock>,
): AnthropicToolResultBlock => {
  if (typeof tr.content === "string") {
    const appendedTexts = textBlocks.map((tb) => tb.text).join("\n\n")
    return { ...tr, content: `${tr.content}\n\n${appendedTexts}` }
  }
  return { ...tr, content: [...tr.content, ...textBlocks] }
}

const formatToolResultContent = (block: AnthropicToolResultBlock): string => {
  if (typeof block.content === "string") {
    return block.content
  }

  return block.content
    .map((item) =>
      item.type === "text" ? item.text : `[image:${item.source.media_type}]`,
    )
    .join("\n")
}

export const sanitizeOrphanToolResults = (
  anthropicPayload: AnthropicMessagesPayload,
): void => {
  for (const [index, msg] of anthropicPayload.messages.entries()) {
    if (msg.role !== "user" || !Array.isArray(msg.content)) continue

    const previousMessage =
      index > 0 ? anthropicPayload.messages[index - 1] : undefined
    const toolUseIds = new Set<string>()

    if (
      previousMessage
      && previousMessage.role === "assistant"
      && Array.isArray(previousMessage.content)
    ) {
      for (const block of previousMessage.content) {
        if (block.type === "tool_use") {
          toolUseIds.add(block.id)
        }
      }
    }

    msg.content = msg.content.map((block) => {
      if (block.type !== "tool_result") {
        return block
      }

      if (toolUseIds.has(block.tool_use_id)) {
        return block
      }

      logger.warn(
        `Orphan tool_result converted to text at message index ${index}, tool_use_id=${block.tool_use_id}`,
      )

      const contentText = formatToolResultContent(block)
      return {
        type: "text",
        text:
          contentText
          || "[tool_result without corresponding tool_use was removed]",
      }
    })
  }
}

const mergeToolResultForClaude = (
  anthropicPayload: AnthropicMessagesPayload,
): void => {
  for (const msg of anthropicPayload.messages) {
    if (msg.role !== "user" || !Array.isArray(msg.content)) continue

    const toolResults: Array<AnthropicToolResultBlock> = []
    const textBlocks: Array<AnthropicTextBlock> = []
    let valid = true

    for (const block of msg.content) {
      if (block.type === "tool_result") {
        toolResults.push(block)
      } else if (block.type === "text") {
        textBlocks.push(block)
      } else {
        valid = false
        break
      }
    }

    if (!valid || toolResults.length === 0 || textBlocks.length === 0) continue

    msg.content = mergeToolResult(toolResults, textBlocks)
  }
}

const mergeToolResult = (
  toolResults: Array<AnthropicToolResultBlock>,
  textBlocks: Array<AnthropicTextBlock>,
): Array<AnthropicToolResultBlock> => {
  // equal lengths -> pairwise merge
  if (toolResults.length === textBlocks.length) {
    return toolResults.map((tr, i) => mergeContentWithText(tr, textBlocks[i]))
  }

  // lengths differ -> append all textBlocks to the last tool_result
  const lastIndex = toolResults.length - 1
  return toolResults.map((tr, i) =>
    i === lastIndex ? mergeContentWithTexts(tr, textBlocks) : tr,
  )
}
