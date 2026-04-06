import type { AnthropicMessagesPayload } from "./anthropic-types"

interface AnthropicToolLike {
  name?: unknown
  description?: unknown
  input_schema?: unknown
}

const sanitizeAnthropicTool = (
  tool: AnthropicToolLike,
): Record<string, unknown> => {
  const sanitized: Record<string, unknown> = {}

  if (typeof tool.name === "string") {
    sanitized.name = tool.name
  }

  if (typeof tool.description === "string") {
    sanitized.description = tool.description
  }

  if (tool.input_schema && typeof tool.input_schema === "object") {
    sanitized.input_schema = tool.input_schema
  }

  return sanitized
}

export function sanitizeAnthropicPayload(
  payload: AnthropicMessagesPayload,
): void {
  // Remove unsupported fields that Copilot API rejects.
  // biome-ignore lint/performance/noDelete: cleaning up unsupported fields
  delete (payload as unknown as Record<string, unknown>).context_management

  if (!Array.isArray(payload.tools)) {
    return
  }

  payload.tools = payload.tools.map((tool) =>
    sanitizeAnthropicTool(tool as AnthropicToolLike),
  ) as unknown as AnthropicMessagesPayload["tools"]
}
