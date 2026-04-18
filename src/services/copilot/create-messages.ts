import { events } from "fetch-event-stream"

import type {
  AnthropicMessagesPayload,
  AnthropicResponse,
} from "~/routes/messages/anthropic-types"
import type { SubagentMarker } from "~/routes/messages/subagent-marker"

import { ensureMessagesPayloadWithinContextWindow } from "~/lib/context-budget"
import { runtimeManager } from "~/lib/runtime-manager"
import { sanitizeAnthropicPayload } from "~/routes/messages/sanitize"
import { copilotRequest } from "~/services/copilot-provider/create-provider"

export type MessagesStream = ReturnType<typeof events>
export type CreateMessagesReturn = AnthropicResponse | MessagesStream

const SUPPORTED_BETA_FEATURES = new Set([
  "advanced-tool-use-2025-11-20",
  "interleaved-thinking-2025-05-14",
])

function filterBetaHeader(header: string): string | undefined {
  const supported = header
    .split(",")
    .map((s) => s.trim())
    .filter((s) => SUPPORTED_BETA_FEATURES.has(s))
  return supported.length > 0 ? supported.join(",") : undefined
}

interface SubagentInfo {
  subagentMarker: SubagentMarker | null
  sessionId: string | undefined
}

interface CreateMessagesOptions extends SubagentInfo {
  anthropicBetaHeader?: string
  initiatorOverride?: "agent" | "user"
}

function buildBetaHeaders(
  anthropicBetaHeader: string | undefined,
  payload: AnthropicMessagesPayload,
): Record<string, string> {
  const headers: Record<string, string> = {}
  const filteredBeta =
    anthropicBetaHeader ? filterBetaHeader(anthropicBetaHeader) : undefined
  if (filteredBeta) {
    headers["anthropic-beta"] = filteredBeta
  } else if (payload.thinking?.budget_tokens) {
    headers["anthropic-beta"] = "interleaved-thinking-2025-05-14"
  }
  return headers
}

export const createMessages = async (
  payload: AnthropicMessagesPayload,
  options: CreateMessagesOptions = {
    anthropicBetaHeader: undefined,
    initiatorOverride: undefined,
    sessionId: undefined,
    subagentMarker: null,
  },
): Promise<CreateMessagesReturn> => {
  const inferInitiator = (
    nextPayload: AnthropicMessagesPayload,
  ): "agent" | "user" => {
    const lastMessage = nextPayload.messages.at(-1)
    if (lastMessage?.role !== "user") return "user"
    const hasUserInput =
      Array.isArray(lastMessage.content) ?
        lastMessage.content.some((block) => block.type !== "tool_result")
      : true
    return hasUserInput ? "user" : "agent"
  }

  sanitizeAnthropicPayload(payload)
  const selectedModel = runtimeManager
    .getCurrentModels()
    ?.data.find((model) => model.id === payload.model)
  const managedPayload = await ensureMessagesPayloadWithinContextWindow(
    payload,
    selectedModel,
  )

  const enableVision = managedPayload.messages.some(
    (message) =>
      Array.isArray(message.content)
      && message.content.some((block) => block.type === "image"),
  )

  const response = await copilotRequest({
    path: "/v1/messages",
    body: managedPayload,
    vision: enableVision,
    initiator: options.initiatorOverride ?? inferInitiator(managedPayload),
    subagentMarker: options.subagentMarker,
    sessionId: options.sessionId,
    extraHeaders: buildBetaHeaders(options.anthropicBetaHeader, managedPayload),
  })

  if (managedPayload.stream) {
    return events(response)
  }

  return (await response.json()) as AnthropicResponse
}
