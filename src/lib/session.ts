import type { Context } from "hono"

import { createHash } from "node:crypto"

import type { AnthropicMessagesPayload } from "~/routes/messages/anthropic-types"

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

/**
 * Extracts the root session ID from the Anthropic payload or request headers.
 * Prefers `metadata.user_id` (_session_<id> pattern), falls back to `x-session-id` header.
 */
export const getRootSessionId = (
  anthropicPayload: AnthropicMessagesPayload,
  c: Context,
): string | undefined => {
  let sessionId: string | undefined

  if (anthropicPayload.metadata?.user_id) {
    const sessionMatch = /_session_(.+)$/.exec(
      anthropicPayload.metadata.user_id,
    )
    sessionId = sessionMatch ? sessionMatch[1] : undefined
  } else {
    sessionId = c.req.header("x-session-id")
  }

  if (sessionId) {
    return getUUID(sessionId)
  }

  return sessionId
}
