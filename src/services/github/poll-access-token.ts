import consola from "consola"

import {
  GITHUB_BASE_URL,
  GITHUB_CLIENT_ID,
  standardHeaders,
} from "~/lib/api-config"

/**
 * Single poll attempt for access token (non-blocking, for Web API use)
 * Returns the token if successful, or a status indicating the current state
 */
export async function pollAccessTokenOnce(
  deviceCode: string,
): Promise<PollResult> {
  consola.debug(
    "[pollAccessTokenOnce] Starting poll for deviceCode:",
    deviceCode.slice(0, 10) + "...",
  )

  const requestBody = {
    client_id: GITHUB_CLIENT_ID,
    device_code: deviceCode,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  }
  consola.debug("[pollAccessTokenOnce] Request body:", requestBody)

  const response = await fetch(`${GITHUB_BASE_URL}/login/oauth/access_token`, {
    method: "POST",
    headers: standardHeaders(),
    body: JSON.stringify(requestBody),
  })

  consola.debug("[pollAccessTokenOnce] Response status:", response.status)
  consola.debug(
    "[pollAccessTokenOnce] Response headers:",
    Object.fromEntries(response.headers.entries()),
  )

  if (!response.ok) {
    const errorText = await response.text()
    consola.error("[pollAccessTokenOnce] HTTP error:", errorText)
    return { status: "error", error: errorText }
  }

  const rawText = await response.text()
  consola.debug("[pollAccessTokenOnce] Raw response text:", rawText)

  // GitHub might return form-urlencoded instead of JSON
  let json: AccessTokenResponse | OAuthErrorResponse

  try {
    json = JSON.parse(rawText) as AccessTokenResponse | OAuthErrorResponse
    consola.debug("[pollAccessTokenOnce] Parsed as JSON:", json)
  } catch {
    // Try parsing as form-urlencoded (e.g., "access_token=xxx&token_type=bearer&scope=")
    consola.debug(
      "[pollAccessTokenOnce] Not JSON, trying form-urlencoded parse",
    )
    const params = new URLSearchParams(rawText)
    const parsed: Record<string, string> = {}
    for (const [key, value] of params.entries()) {
      parsed[key] = value
    }
    consola.debug("[pollAccessTokenOnce] Parsed as form-urlencoded:", parsed)

    if (parsed.access_token) {
      json = {
        access_token: parsed.access_token,
        token_type: parsed.token_type || "bearer",
        scope: parsed.scope || "",
      }
    } else if (parsed.error) {
      json = {
        error: parsed.error,
        error_description: parsed.error_description,
      }
    } else {
      consola.error("[pollAccessTokenOnce] Could not parse response:", rawText)
      return { status: "error", error: "Could not parse response" }
    }
  }

  // Check for OAuth error responses
  if ("error" in json) {
    consola.debug("[pollAccessTokenOnce] OAuth error:", json.error)
    if (json.error === "authorization_pending") {
      return { status: "pending" }
    }
    if (json.error === "slow_down") {
      // GitHub returns a new interval when slow_down occurs, use it or default to 10 seconds
      const newInterval = (json as { interval?: number }).interval ?? 10
      return { status: "slow_down", interval: newInterval }
    }
    if (json.error === "expired_token") {
      return { status: "expired" }
    }
    if (json.error === "access_denied") {
      return { status: "denied" }
    }
    return { status: "error", error: json.error_description || json.error }
  }

  // Success - we have the access token
  if (json.access_token) {
    consola.debug(
      "[pollAccessTokenOnce] SUCCESS! Got access token:",
      json.access_token.slice(0, 10) + "...",
    )
    return { status: "success", token: json.access_token }
  }

  consola.debug(
    "[pollAccessTokenOnce] No token and no error, returning pending",
  )
  return { status: "pending" }
}

export type PollResult =
  | { status: "success"; token: string }
  | { status: "pending" }
  | { status: "slow_down"; interval: number }
  | { status: "expired" }
  | { status: "denied" }
  | { status: "error"; error: string }

interface AccessTokenResponse {
  access_token: string
  token_type: string
  scope: string
}

interface OAuthErrorResponse {
  error: string
  error_description?: string
  error_uri?: string
}
