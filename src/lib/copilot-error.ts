/* eslint-disable complexity */
import { APICallError } from "@ai-sdk/provider"
import { STATUS_CODES } from "node:http"

/**
 * Context overflow detection patterns adapted from opencode.
 * Covers major providers: Anthropic, OpenAI, Google, Copilot, etc.
 */
const OVERFLOW_PATTERNS = [
  /prompt is too long/i,
  /input is too long for requested model/i,
  /exceeds the context window/i,
  /input token count.*exceeds the maximum/i,
  /maximum prompt length is \d+/i,
  /reduce the length of the messages/i,
  /maximum context length is \d+ tokens/i,
  /exceeds the limit of \d+/i,
  /exceeds the available context size/i,
  /greater than the context length/i,
  /context window exceeds limit/i,
  /exceeded model token limit/i,
  /context[_ ]length[_ ]exceeded/i,
  /request entity too large/i,
]

export function isContextOverflow(message: string): boolean {
  if (OVERFLOW_PATTERNS.some((p) => p.test(message))) return true
  return /^4(?:00|13)\s*(?:status code\s*)?\(no body\)/i.test(message)
}

export class ContextOverflowError extends Error {
  readonly statusCode: number
  readonly responseBody?: string

  constructor(
    message: string,
    statusCode: number = 400,
    responseBody?: string,
  ) {
    super(message)
    this.name = "ContextOverflowError"
    this.statusCode = statusCode
    this.responseBody = responseBody
  }
}

function tryParseJson(input: unknown): Record<string, unknown> | undefined {
  if (typeof input === "string") {
    try {
      const result: unknown = JSON.parse(input)
      if (isRecord(result)) return result
    } catch {
      return undefined
    }
    return undefined
  }
  if (isRecord(input)) {
    return input
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Extract a human-readable error message from an APICallError.
 */
function extractErrorMessage(e: APICallError): string {
  const msg = e.message

  if (msg === "") {
    if (e.responseBody) return e.responseBody
    if (e.statusCode) {
      const err = STATUS_CODES[e.statusCode]
      if (err) return err
    }
    return "Unknown error"
  }

  if (!e.responseBody || (e.statusCode && msg !== STATUS_CODES[e.statusCode])) {
    return msg
  }

  try {
    const body = tryParseJson(e.responseBody)
    const errorValue = body?.error
    const errorBody =
      errorValue && typeof errorValue === "object" ?
        (errorValue as Record<string, unknown>)
      : undefined
    const errMsg = [body?.message, errorBody?.message, body?.error].find(
      (value): value is string => typeof value === "string",
    )
    if (errMsg && typeof errMsg === "string") {
      return `${msg}: ${errMsg}`
    }
  } catch {
    return `${msg}: ${e.responseBody}`.trim()
  }

  // Human-readable message for HTML error pages
  if (/^\s*<!doctype|^\s*<html/i.test(e.responseBody)) {
    if (e.statusCode === 401) {
      return "Unauthorized: request was blocked by a gateway or proxy. Authentication token may be missing or expired."
    }
    if (e.statusCode === 403) {
      return "Forbidden: request was blocked by a gateway or proxy. You may not have permission to access this resource."
    }
    return msg
  }

  return `${msg}: ${e.responseBody}`.trim()
}

export interface ParsedAPICallError {
  type: "context_overflow" | "api_error"
  message: string
  statusCode?: number
  isRetryable?: boolean
  responseBody?: string
}

/**
 * Parse an APICallError into a structured result with overflow detection.
 */
export function parseAPICallError(error: APICallError): ParsedAPICallError {
  const msg = extractErrorMessage(error)
  const body = tryParseJson(error.responseBody)
  const errorBody =
    body?.error && typeof body.error === "object" ?
      (body.error as Record<string, unknown>)
    : undefined

  if (
    isContextOverflow(msg)
    || error.statusCode === 413
    || errorBody?.code === "context_length_exceeded"
  ) {
    return {
      type: "context_overflow",
      message: msg,
      responseBody: error.responseBody,
    }
  }

  return {
    type: "api_error",
    message: msg,
    statusCode: error.statusCode,
    isRetryable: error.isRetryable,
    responseBody: error.responseBody,
  }
}
