/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import {
  type LanguageModelV2CallOptions,
  type LanguageModelV2CallWarning,
  UnsupportedFunctionalityError,
} from "@ai-sdk/provider"

export function prepareTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV2CallOptions["tools"]
  toolChoice?: LanguageModelV2CallOptions["toolChoice"]
}): {
  tools:
    | undefined
    | Array<{
        type: "function"
        function: {
          name: string
          description: string | undefined
          parameters: unknown
        }
      }>
  toolChoice:
    | { type: "function"; function: { name: string } }
    | "auto"
    | "none"
    | "required"
    | undefined
  toolWarnings: Array<LanguageModelV2CallWarning>
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  const normalizedTools = tools?.length ? tools : undefined

  const toolWarnings: Array<LanguageModelV2CallWarning> = []

  if (normalizedTools === null || normalizedTools === undefined) {
    return { tools: undefined, toolChoice: undefined, toolWarnings }
  }

  const openaiCompatTools: Array<{
    type: "function"
    function: {
      name: string
      description: string | undefined
      parameters: unknown
    }
  }> = []

  for (const tool of normalizedTools) {
    if (tool.type === "provider-defined") {
      toolWarnings.push({ type: "unsupported-tool", tool })
    } else {
      openaiCompatTools.push({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      })
    }
  }

  if (toolChoice === null || toolChoice === undefined) {
    return { tools: openaiCompatTools, toolChoice: undefined, toolWarnings }
  }

  const type = toolChoice.type

  switch (type) {
    case "auto":
    case "none":
    case "required": {
      return { tools: openaiCompatTools, toolChoice: type, toolWarnings }
    }
    case "tool": {
      return {
        tools: openaiCompatTools,
        toolChoice: {
          type: "function",
          function: { name: toolChoice.toolName },
        },
        toolWarnings,
      }
    }
    default: {
      const _exhaustiveCheck: never = type
      throw new UnsupportedFunctionalityError({
        functionality: `tool choice type: ${String(_exhaustiveCheck)}`,
      })
    }
  }
}
