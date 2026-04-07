import type { Context, MiddlewareHandler } from "hono"

import consola from "consola"

import { getConfig } from "./config"

interface AuthMiddlewareOptions {
  getApiKeys?: () => Array<string>
  allowUnauthenticatedPaths?: Array<string>
  allowUnauthenticatedPathPrefixes?: Array<string>
  allowOptionsBypass?: boolean
}

export function normalizeApiKeys(apiKeys: unknown): Array<string> {
  if (!Array.isArray(apiKeys)) {
    if (apiKeys !== undefined) {
      consola.warn("Invalid auth.apiKeys config. Expected an array of strings.")
    }
    return []
  }

  const normalizedKeys = apiKeys
    .filter((key): key is string => typeof key === "string")
    .map((key) => key.trim())
    .filter((key) => key.length > 0)

  if (normalizedKeys.length !== apiKeys.length) {
    consola.warn(
      "Invalid auth.apiKeys entries found. Only non-empty strings are allowed.",
    )
  }

  return [...new Set(normalizedKeys)]
}

export function getConfiguredApiKeys(): Array<string> {
  const config = getConfig()
  const singleApiKey = config.auth?.apiKey?.trim()
  if (singleApiKey) {
    return [singleApiKey]
  }

  return normalizeApiKeys(config.auth?.apiKeys)
}

export function extractRequestApiKey(c: Context): string | null {
  const xApiKey = c.req.header("x-api-key")?.trim()
  if (xApiKey) {
    return xApiKey
  }

  const authorization = c.req.header("authorization")
  if (!authorization) {
    return null
  }

  const [scheme, ...rest] = authorization.trim().split(/\s+/)
  if (scheme.toLowerCase() !== "bearer") {
    return null
  }

  const bearerToken = rest.join(" ").trim()
  return bearerToken || null
}

function createUnauthorizedResponse(c: Context): Response {
  c.header("WWW-Authenticate", 'Bearer realm="copilot-api"')
  return c.json(
    {
      error: {
        message: "Unauthorized",
        type: "authentication_error",
      },
    },
    401,
  )
}

function isAllowPath(
  path: string,
  allowPaths: Array<string>,
  allowPathPrefixes: Array<string>,
): boolean {
  if (allowPaths.includes(path)) {
    return true
  }

  return allowPathPrefixes.some((prefix) => path.startsWith(prefix))
}

export function createAuthMiddleware(
  options: AuthMiddlewareOptions = {},
): MiddlewareHandler {
  const getApiKeys = options.getApiKeys ?? getConfiguredApiKeys
  const allowUnauthenticatedPaths = options.allowUnauthenticatedPaths ?? ["/"]
  const allowUnauthenticatedPathPrefixes =
    options.allowUnauthenticatedPathPrefixes ?? []
  const allowOptionsBypass = options.allowOptionsBypass ?? true

  return async (c, next) => {
    if (allowOptionsBypass && c.req.method === "OPTIONS") {
      return next()
    }

    if (
      isAllowPath(
        c.req.path,
        allowUnauthenticatedPaths,
        allowUnauthenticatedPathPrefixes,
      )
    ) {
      return next()
    }

    const apiKeys = getApiKeys()
    if (apiKeys.length === 0) {
      return next()
    }

    const requestApiKey = extractRequestApiKey(c)
    if (!requestApiKey || !apiKeys.includes(requestApiKey)) {
      return createUnauthorizedResponse(c)
    }

    return next()
  }
}
