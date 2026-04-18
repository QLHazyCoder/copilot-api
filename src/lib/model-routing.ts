import type { Model } from "~/services/copilot/get-models"

import { getMappedModel } from "./config"
import { state } from "./state"
import { cacheModels } from "./utils"

const CHAT_COMPLETIONS_ENDPOINT = "/chat/completions"
const CHAT_COMPLETIONS_V1_ENDPOINT = "/v1/chat/completions"
const RESPONSES_ENDPOINT = "/responses"
const RESPONSES_V1_ENDPOINT = "/v1/responses"
const MESSAGES_ENDPOINT = "/v1/messages"
const MESSAGES_LEGACY_ENDPOINT = "/messages"

const BUILTIN_MODEL_ALIASES: Record<string, string> = {
  "gemini-3-pro-preview": "gemini-3.1-pro-preview",
}

export interface ModelEndpointCapabilities {
  supportsChatCompletions: boolean
  supportsResponses: boolean
  supportsMessages: boolean
  hasEndpointMetadata: boolean
}

export interface ResolvedModelRequest {
  requestedModel: string
  configuredModel: string
  routedModel: string
  selectedModel: Model | undefined
  capabilities: ModelEndpointCapabilities
}

export async function resolveModelRequest(
  requestedModel: string,
): Promise<ResolvedModelRequest> {
  const configuredModel = getMappedModel(requestedModel)

  let resolvedModel = findModelFromState(requestedModel, configuredModel)
  if (!resolvedModel.model) {
    await cacheModels()
    resolvedModel = findModelFromState(requestedModel, configuredModel)
  }

  return {
    requestedModel,
    configuredModel,
    routedModel: resolvedModel.routedModel,
    selectedModel: resolvedModel.model,
    capabilities: getModelEndpointCapabilities(
      resolvedModel.model?.supported_endpoints,
    ),
  }
}

export function getModelEndpointCapabilities(
  supportedEndpoints: Array<string> | undefined,
): ModelEndpointCapabilities {
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

export function buildUnknownModelMessage(
  resolution: Pick<
    ResolvedModelRequest,
    "requestedModel" | "configuredModel" | "routedModel"
  >,
): string {
  if (
    resolution.requestedModel === resolution.configuredModel
    && resolution.configuredModel === resolution.routedModel
  ) {
    return `Unknown model: ${resolution.requestedModel}. Check /v1/models or configure Model Mappings in /admin.`
  }

  if (resolution.configuredModel !== resolution.requestedModel) {
    return `Unknown model: ${resolution.requestedModel}. It is mapped to ${resolution.configuredModel}, but that target model is not available. Check /v1/models or configure Model Mappings in /admin.`
  }

  return `Unknown model: ${resolution.requestedModel}. It resolves to ${resolution.routedModel}, but that target model is not available. Check /v1/models or configure Model Mappings in /admin.`
}

function findModelFromState(
  requestedModel: string,
  configuredModel: string,
): { model: Model | undefined; routedModel: string } {
  const lookupCandidates = getLookupCandidates(requestedModel, configuredModel)

  for (const candidate of lookupCandidates) {
    const model = state.models?.data.find((item) => item.id === candidate)
    if (model) {
      return {
        model,
        routedModel: candidate,
      }
    }
  }

  return {
    model: undefined,
    routedModel: lookupCandidates[0] ?? configuredModel,
  }
}

function getLookupCandidates(
  requestedModel: string,
  configuredModel: string,
): Array<string> {
  const candidates = [configuredModel]
  if (configuredModel === requestedModel) {
    const aliasedModel = BUILTIN_MODEL_ALIASES[requestedModel]
    if (aliasedModel && aliasedModel !== configuredModel) {
      candidates.push(aliasedModel)
    }
  }

  return candidates
}

function normalizeEndpointPath(endpoint: string): string {
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

function extractPathnameFromUrl(input: string): string {
  try {
    return new URL(input).pathname
  } catch {
    return input
  }
}
