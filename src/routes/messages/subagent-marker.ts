import type { AnthropicMessagesPayload } from "./anthropic-types"

const SUBAGENT_MARKER_PREFIX = "__SUBAGENT_MARKER__"

export interface SubagentMarker {
  session_id: string
  agent_id: string
  agent_type: string
}

export const parseSubagentMarkerFromFirstUser = (
  payload: AnthropicMessagesPayload,
): SubagentMarker | null => {
  const firstUserMessage = payload.messages.find((msg) => msg.role === "user")
  if (!firstUserMessage || !Array.isArray(firstUserMessage.content)) {
    return null
  }

  for (const block of firstUserMessage.content) {
    if (block.type !== "text") {
      continue
    }

    const marker = parseSubagentMarkerFromSystemReminder(block.text)
    if (marker) {
      return marker
    }
  }

  return null
}

const parseSubagentMarkerFromSystemReminder = (
  text: string,
): SubagentMarker | null => {
  const startTag = "<system-reminder>"
  const endTag = "</system-reminder>"
  let searchFrom = 0

  while (true) {
    const reminderStart = text.indexOf(startTag, searchFrom)
    if (reminderStart === -1) {
      break
    }

    const contentStart = reminderStart + startTag.length
    const reminderEnd = text.indexOf(endTag, contentStart)
    if (reminderEnd === -1) {
      break
    }

    const reminderContent = text.slice(contentStart, reminderEnd)
    const markerIndex = reminderContent.indexOf(SUBAGENT_MARKER_PREFIX)
    if (markerIndex === -1) {
      searchFrom = reminderEnd + endTag.length
      continue
    }

    const markerJson = reminderContent
      .slice(markerIndex + SUBAGENT_MARKER_PREFIX.length)
      .trim()

    try {
      const parsed = JSON.parse(markerJson) as SubagentMarker
      if (!parsed.session_id || !parsed.agent_id || !parsed.agent_type) {
        searchFrom = reminderEnd + endTag.length
        continue
      }

      return parsed
    } catch {
      searchFrom = reminderEnd + endTag.length
      continue
    }
  }

  return null
}
