/* eslint-disable complexity, max-lines-per-function, @typescript-eslint/no-unnecessary-condition */
import {
  type LanguageModelV2CallOptions,
  type LanguageModelV2CallWarning,
  UnsupportedFunctionalityError,
} from "@ai-sdk/provider"
import { z } from "zod/v4"

import type { OpenAIResponsesTool } from "./openai-responses-api-types"

import { codeInterpreterArgsSchema } from "./tool/code-interpreter"
import { fileSearchArgsSchema } from "./tool/file-search"
import { imageGenerationArgsSchema } from "./tool/image-generation"
import { webSearchArgsSchema } from "./tool/web-search"
import { webSearchPreviewArgsSchema } from "./tool/web-search-preview"

export function prepareResponsesTools({
  tools,
  toolChoice,
  strictJsonSchema,
}: {
  tools: LanguageModelV2CallOptions["tools"]
  toolChoice?: LanguageModelV2CallOptions["toolChoice"]
  strictJsonSchema: boolean
}): {
  tools?: Array<OpenAIResponsesTool>
  toolChoice?:
    | "auto"
    | "none"
    | "required"
    | { type: "file_search" }
    | { type: "web_search_preview" }
    | { type: "web_search" }
    | { type: "function"; name: string }
    | { type: "code_interpreter" }
    | { type: "image_generation" }
  toolWarnings: Array<LanguageModelV2CallWarning>
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  const normalizedTools = tools?.length ? tools : undefined

  const toolWarnings: Array<LanguageModelV2CallWarning> = []

  if (normalizedTools === null || normalizedTools === undefined) {
    return { tools: undefined, toolChoice: undefined, toolWarnings }
  }

  const openaiTools: Array<OpenAIResponsesTool> = []

  for (const tool of normalizedTools) {
    switch (tool.type) {
      case "function": {
        openaiTools.push({
          type: "function",
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
          strict: strictJsonSchema,
        })
        break
      }
      case "provider-defined": {
        switch (tool.id) {
          case "openai.file_search": {
            const args = fileSearchArgsSchema.parse(tool.args)

            openaiTools.push({
              type: "file_search",
              vector_store_ids: args.vectorStoreIds,
              max_num_results: args.maxNumResults,
              ranking_options:
                args.ranking ?
                  {
                    ranker: args.ranking.ranker,
                    score_threshold: args.ranking.scoreThreshold,
                  }
                : undefined,
              filters: args.filters,
            })

            break
          }
          case "openai.local_shell": {
            openaiTools.push({
              type: "local_shell",
            })
            break
          }
          case "openai.web_search_preview": {
            const args = webSearchPreviewArgsSchema.parse(tool.args)
            openaiTools.push({
              type: "web_search_preview",
              search_context_size: args.searchContextSize,
              user_location: args.userLocation,
            })
            break
          }
          case "openai.web_search": {
            const args = webSearchArgsSchema.parse(tool.args)
            openaiTools.push({
              type: "web_search",
              filters:
                args.filters !== null && args.filters !== undefined ?
                  { allowed_domains: args.filters.allowedDomains }
                : undefined,
              search_context_size: args.searchContextSize,
              user_location: args.userLocation,
            })
            break
          }
          case "openai.code_interpreter": {
            const args = codeInterpreterArgsSchema.parse(tool.args)
            openaiTools.push({
              type: "code_interpreter",
              container: getCodeInterpreterContainer(args.container),
            })
            break
          }
          case "openai.image_generation": {
            const args = imageGenerationArgsSchema.parse(tool.args)
            openaiTools.push({
              type: "image_generation",
              background: args.background,
              input_fidelity: args.inputFidelity,
              input_image_mask:
                args.inputImageMask ?
                  {
                    file_id: args.inputImageMask.fileId,
                    image_url: args.inputImageMask.imageUrl,
                  }
                : undefined,
              model: args.model,
              moderation: args.moderation,
              partial_images: args.partialImages,
              quality: args.quality,
              output_compression: args.outputCompression,
              output_format: args.outputFormat,
              size: args.size,
            })
            break
          }
          default: {
            toolWarnings.push({ type: "unsupported-tool", tool })
            break
          }
        }
        break
      }
      default: {
        toolWarnings.push({ type: "unsupported-tool", tool })
        break
      }
    }
  }

  if (toolChoice === null || toolChoice === undefined) {
    return { tools: openaiTools, toolChoice: undefined, toolWarnings }
  }

  const type = toolChoice.type

  switch (type) {
    case "auto":
    case "none":
    case "required": {
      return { tools: openaiTools, toolChoice: type, toolWarnings }
    }
    case "tool": {
      const builtInToolChoice = getBuiltInToolChoice(toolChoice.toolName)

      return {
        tools: openaiTools,
        toolChoice: builtInToolChoice ?? {
          type: "function",
          name: toolChoice.toolName,
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

function getCodeInterpreterContainer(
  container: z.infer<typeof codeInterpreterArgsSchema>["container"],
): Extract<OpenAIResponsesTool, { type: "code_interpreter" }>["container"] {
  if (container === null || container === undefined) {
    return { type: "auto", file_ids: undefined }
  }

  if (typeof container === "string") {
    return container
  }

  return { type: "auto", file_ids: container.fileIds }
}

function getBuiltInToolChoice(
  toolName: string,
):
  | { type: "file_search" }
  | { type: "web_search_preview" }
  | { type: "web_search" }
  | { type: "code_interpreter" }
  | { type: "image_generation" }
  | undefined {
  switch (toolName) {
    case "code_interpreter": {
      return { type: "code_interpreter" }
    }
    case "file_search": {
      return { type: "file_search" }
    }
    case "image_generation": {
      return { type: "image_generation" }
    }
    case "web_search_preview": {
      return { type: "web_search_preview" }
    }
    case "web_search": {
      return { type: "web_search" }
    }
    default: {
      return undefined
    }
  }
}
