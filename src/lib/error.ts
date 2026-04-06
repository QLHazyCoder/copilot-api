import type { Context } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"

import { APICallError } from "@ai-sdk/provider"
import consola from "consola"

import { ContextOverflowError, parseAPICallError } from "~/lib/copilot-error"

export class HTTPError extends Error {
  response: Response

  constructor(message: string, response: Response) {
    super(message)
    this.response = response
  }
}

export async function forwardError(c: Context, error: unknown) {
  consola.error("Error occurred:", error)

  if (error instanceof ContextOverflowError) {
    return c.json(
      {
        error: {
          message: error.message,
          type: "context_overflow",
          code: "context_length_exceeded",
        },
      },
      error.statusCode as ContentfulStatusCode,
    )
  }

  if (error instanceof APICallError) {
    const parsed = parseAPICallError(error)
    const statusCode = (parsed.statusCode ?? 500) as ContentfulStatusCode
    return c.json(
      {
        error: {
          message: parsed.message,
          type: parsed.type,
          code:
            parsed.type === "context_overflow" ?
              "context_length_exceeded"
            : undefined,
        },
      },
      statusCode,
    )
  }

  if (error instanceof HTTPError) {
    const errorText = await error.response.text()
    let errorJson: unknown
    try {
      errorJson = JSON.parse(errorText)
    } catch {
      errorJson = errorText
    }
    consola.error("HTTP error:", errorJson)
    return c.json(
      {
        error: {
          message: errorText,
          type: "error",
        },
      },
      error.response.status as ContentfulStatusCode,
    )
  }

  return c.json(
    {
      error: {
        message: (error as Error).message,
        type: "error",
      },
    },
    500,
  )
}
