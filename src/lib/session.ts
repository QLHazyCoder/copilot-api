import type { Context } from "hono"

import { createHash } from "node:crypto"

import type { AnthropicMessagesPayload } from "~/routes/messages/anthropic-types"

const USER_ID_SAFETY_IDENTIFIER_PATTERN = /user_([^_]+)_account/
const USER_ID_SESSION_PATTERN = /_session_(.+)$/

/**
 * Converts an arbitrary string into a deterministic UUID v4-like format
 */
const getUUID = (input: string): string => {
  const hash = createHash("sha256").update(input).digest("hex")
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-")
}

function getTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export interface ParsedAnthropicUserIdMetadata {
  safetyIdentifier: string | null
  promptCacheKey: string | null
  conversationId: string | undefined
  conversationIdSource:
    | "user-id-session-suffix"
    | "user-id-json-session-id"
    | null
}

export type ConversationIdSource =
  | "anthropic-metadata.user_id"
  | "anthropic-metadata.user_id.session_id-json"
  | "responses.prompt_cache_key"
  | "header.x-interaction-id"
  | "header.x-session-id"
  | "none"

export interface ResolvedConversationId {
  conversationId: string | undefined
  source: ConversationIdSource
  rawValue: string | undefined
}

export function normalizeConversationId(raw: string): string {
  return getUUID(raw.trim())
}

export function parseAnthropicUserIdMetadata(
  userId: string | undefined,
): ParsedAnthropicUserIdMetadata {
  const normalizedUserId = getTrimmedString(userId)
  if (!normalizedUserId) {
    return {
      safetyIdentifier: null,
      promptCacheKey: null,
      conversationId: undefined,
      conversationIdSource: null,
    }
  }

  const safetyIdentifierMatch =
    USER_ID_SAFETY_IDENTIFIER_PATTERN.exec(normalizedUserId)
  const promptCacheKeyMatch = USER_ID_SESSION_PATTERN.exec(normalizedUserId)
  const suffixPromptCacheKey = promptCacheKeyMatch?.[1]?.trim() || null
  const jsonSessionId = getJsonSessionIdFromAnthropicUserId(normalizedUserId)
  const promptCacheKey = suffixPromptCacheKey ?? jsonSessionId
  let conversationIdSource: ParsedAnthropicUserIdMetadata["conversationIdSource"] =
    null

  if (suffixPromptCacheKey) {
    conversationIdSource = "user-id-session-suffix"
  } else if (jsonSessionId) {
    conversationIdSource = "user-id-json-session-id"
  }

  return {
    safetyIdentifier: safetyIdentifierMatch?.[1] ?? null,
    promptCacheKey,
    conversationId:
      promptCacheKey ? normalizeConversationId(promptCacheKey) : undefined,
    conversationIdSource,
  }
}

function getJsonSessionIdFromAnthropicUserId(userId: string): string | null {
  if (!userId.startsWith("{")) {
    return null
  }

  try {
    const parsed = JSON.parse(userId) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null
    }

    const sessionId = getTrimmedString(
      (parsed as { session_id?: unknown }).session_id,
    )
    return sessionId ?? null
  } catch {
    return null
  }
}

export function getConversationIdFromHeaders(c: Context): string | undefined {
  return resolveConversationIdFromHeaders(c).conversationId
}

export function resolveConversationIdFromHeaders(
  c: Context,
): ResolvedConversationId {
  const interactionId = getTrimmedString(c.req.header("x-interaction-id"))
  if (interactionId) {
    return {
      conversationId: normalizeConversationId(interactionId),
      source: "header.x-interaction-id",
      rawValue: interactionId,
    }
  }

  const sessionId = getTrimmedString(c.req.header("x-session-id"))
  if (sessionId) {
    return {
      conversationId: normalizeConversationId(sessionId),
      source: "header.x-session-id",
      rawValue: sessionId,
    }
  }

  return {
    conversationId: undefined,
    source: "none",
    rawValue: undefined,
  }
}

export function getConversationIdFromAnthropicPayload(
  anthropicPayload: AnthropicMessagesPayload,
  c: Context,
): string | undefined {
  return resolveConversationIdFromAnthropicPayload(anthropicPayload, c)
    .conversationId
}

export function resolveConversationIdFromAnthropicPayload(
  anthropicPayload: AnthropicMessagesPayload,
  c: Context,
): ResolvedConversationId {
  const metadata = parseAnthropicUserIdMetadata(
    anthropicPayload.metadata?.user_id,
  )
  if (metadata.conversationId) {
    return {
      conversationId: metadata.conversationId,
      source:
        metadata.conversationIdSource === "user-id-json-session-id" ?
          "anthropic-metadata.user_id.session_id-json"
        : "anthropic-metadata.user_id",
      rawValue: metadata.promptCacheKey ?? anthropicPayload.metadata?.user_id,
    }
  }

  return resolveConversationIdFromHeaders(c)
}

export function getConversationIdFromResponsesPayload(
  payload: { prompt_cache_key?: string | null },
  c: Context,
): string | undefined {
  return resolveConversationIdFromResponsesPayload(payload, c).conversationId
}

export function resolveConversationIdFromResponsesPayload(
  payload: { prompt_cache_key?: string | null },
  c: Context,
): ResolvedConversationId {
  const promptCacheKey = getTrimmedString(payload.prompt_cache_key)
  if (promptCacheKey) {
    return {
      conversationId: normalizeConversationId(promptCacheKey),
      source: "responses.prompt_cache_key",
      rawValue: promptCacheKey,
    }
  }

  return resolveConversationIdFromHeaders(c)
}

/**
 * Extracts the root session ID from the Anthropic payload or request headers.
 * Prefers `metadata.user_id` (_session_<id> pattern), falls back to `x-session-id` header.
 */
export const getRootSessionId = (
  anthropicPayload: AnthropicMessagesPayload,
  c: Context,
): string | undefined => {
  return getConversationIdFromAnthropicPayload(anthropicPayload, c)
}
