import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { Hono } from "hono"

import type { Model, ModelsResponse } from "../src/services/copilot/get-models"

import { copilotTokenManager } from "../src/lib/copilot-token-manager"
import { normalizeConversationId } from "../src/lib/session"
import { state } from "../src/lib/state"
import { completionRoutes } from "../src/routes/chat-completions/route"
import { geminiRoutes } from "../src/routes/gemini/route"
import { responsesRoutes } from "../src/routes/responses/route"

interface UpstreamRequestRecord {
  body?: unknown
  headers: Record<string, string>
  pathname: string
}

const originalFetch = globalThis.fetch
const originalSetTimeout = globalThis.setTimeout
const upstreamRequests: Array<UpstreamRequestRecord> = []
type TimeoutHandler = Parameters<typeof setTimeout>[0]

const tokenManager = copilotTokenManager as unknown as {
  tokenExpiresAt: number
}

function getRequestUrl(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input
  }

  if (input instanceof URL) {
    return input.toString()
  }

  return input.url
}

function createModel(id: string, supportedEndpoints: Array<string>): Model {
  return {
    id,
    name: id,
    object: "model",
    preview: false,
    vendor: "test",
    version: "1",
    model_picker_enabled: true,
    supported_endpoints: supportedEndpoints,
    capabilities: {
      family: "test",
      object: "capabilities",
      tokenizer: "test",
      type: "chat",
      limits: {
        max_output_tokens: 1024,
      },
      supports: {
        streaming: true,
      },
    },
  }
}

function setModels(models: Array<Model>): void {
  const payload: ModelsResponse = {
    object: "list",
    data: models,
  }
  state.models = payload
}

function createTestApp(): Hono {
  const app = new Hono()
  app.route("/v1/chat/completions", completionRoutes)
  app.route("/v1/responses", responsesRoutes)
  app.route("/v1beta/models", geminiRoutes)
  return app
}

function createFetchResponse(pathname: string): Response {
  if (pathname === "/v1/messages") {
    return Response.json({
      id: "msg_1",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
      model: "fallback-messages-model",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: 1,
        output_tokens: 1,
      },
    })
  }

  if (pathname === "/responses") {
    return Response.json({
      id: "resp_1",
      object: "response",
      created_at: 1,
      model: "responses-model",
      output: [],
      output_text: "ok",
      status: "completed",
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        total_tokens: 2,
      },
      error: null,
      incomplete_details: null,
      instructions: null,
      metadata: null,
      parallel_tool_calls: true,
      temperature: null,
      tool_choice: "auto",
      tools: [],
      top_p: null,
    })
  }

  return Response.json({
    id: "chat_1",
    object: "chat.completion",
    created: 1,
    model: "chat-model",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: "ok",
        },
        logprobs: null,
        finish_reason: "stop",
      },
    ],
  })
}

beforeEach(() => {
  upstreamRequests.length = 0
  state.accountType = "individual"
  state.copilotToken = "test-copilot-token"
  state.githubToken = "test-github-token"
  state.vsCodeVersion = "1.0.0"
  state.rateLimitSeconds = undefined
  state.lastRequestTimestamp = undefined
  state.rateLimitWait = false
  setModels([])
  tokenManager.tokenExpiresAt = Math.floor(Date.now() / 1000) + 3600

  globalThis.setTimeout = ((_handler: TimeoutHandler) =>
    0) as unknown as typeof setTimeout
  globalThis.fetch = ((input, init) => {
    const url = getRequestUrl(input)
    const pathname = new URL(url).pathname
    const headers = Object.fromEntries(new Headers(init?.headers).entries())
    const rawBody = init?.body
    let body: unknown
    if (typeof rawBody === "string") {
      try {
        body = JSON.parse(rawBody)
      } catch {
        body = rawBody
      }
    } else {
      body = rawBody
    }

    upstreamRequests.push({
      body,
      pathname,
      headers,
    })

    return Promise.resolve(createFetchResponse(pathname))
  }) as typeof fetch
})

afterAll(() => {
  globalThis.fetch = originalFetch
  globalThis.setTimeout = originalSetTimeout
})

describe("session propagation", () => {
  test("passes x-session-id to native chat completions requests", async () => {
    setModels([createModel("chat-model", ["/chat/completions"])])
    const app = createTestApp()

    const response = await app.request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-id": "chat-thread-1",
      },
      body: JSON.stringify({
        model: "chat-model",
        messages: [{ role: "user", content: "hello" }],
        stream: false,
      }),
    })

    expect(response.status).toBe(200)
    expect(upstreamRequests[0]?.pathname).toBe("/chat/completions")
    expect(upstreamRequests[0]?.headers["x-interaction-id"]).toBe(
      normalizeConversationId("chat-thread-1"),
    )
  })

  test("passes x-session-id through messages fallback", async () => {
    setModels([createModel("fallback-messages-model", ["/v1/messages"])])
    const app = createTestApp()

    const response = await app.request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-id": "fallback-messages-thread",
      },
      body: JSON.stringify({
        model: "fallback-messages-model",
        messages: [{ role: "user", content: "hello" }],
        stream: false,
      }),
    })

    expect(response.status).toBe(200)
    expect(upstreamRequests[0]?.pathname).toBe("/v1/messages")
    expect(upstreamRequests[0]?.headers["x-interaction-id"]).toBe(
      normalizeConversationId("fallback-messages-thread"),
    )
  })

  test("passes x-session-id through responses fallback", async () => {
    setModels([createModel("fallback-responses-model", ["/responses"])])
    const app = createTestApp()

    const response = await app.request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-id": "fallback-responses-thread",
      },
      body: JSON.stringify({
        model: "fallback-responses-model",
        messages: [{ role: "user", content: "hello" }],
        stream: false,
      }),
    })

    expect(response.status).toBe(200)
    expect(upstreamRequests[0]?.pathname).toBe("/responses")
    expect(upstreamRequests[0]?.headers["x-interaction-id"]).toBe(
      normalizeConversationId("fallback-responses-thread"),
    )
  })

  test("prefers prompt_cache_key for direct responses requests", async () => {
    setModels([createModel("responses-model", ["/responses"])])
    const app = createTestApp()

    const response = await app.request("http://localhost/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-id": "header-thread",
      },
      body: JSON.stringify({
        model: "responses-model",
        input: "hello",
        prompt_cache_key: "responses-thread-1",
        stream: false,
      }),
    })

    expect(response.status).toBe(200)
    expect(upstreamRequests[0]?.pathname).toBe("/responses")
    expect(upstreamRequests[0]?.headers["x-interaction-id"]).toBe(
      normalizeConversationId("responses-thread-1"),
    )
  })

  test("passes x-session-id through gemini requests", async () => {
    setModels([createModel("gemini-chat-model", ["/chat/completions"])])
    const app = createTestApp()

    const response = await app.request(
      "http://localhost/v1beta/models/gemini-chat-model:generateContent",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-session-id": "gemini-thread-1",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: "hello" }],
            },
          ],
        }),
      },
    )

    expect(response.status).toBe(200)
    expect(upstreamRequests[0]?.pathname).toBe("/chat/completions")
    expect(upstreamRequests[0]?.headers["x-interaction-id"]).toBe(
      normalizeConversationId("gemini-thread-1"),
    )
  })
})

describe("routing guardrails", () => {
  test("resolves builtin model aliases before calling upstream chat", async () => {
    setModels([createModel("gemini-3.1-pro-preview", ["/chat/completions"])])
    const app = createTestApp()

    const response = await app.request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-3-pro-preview",
        messages: [{ role: "user", content: "hello" }],
        stream: false,
      }),
    })

    expect(response.status).toBe(200)
    expect(upstreamRequests[0]?.pathname).toBe("/chat/completions")
    expect(
      (upstreamRequests[0]?.body as { model?: string } | undefined)?.model,
    ).toBe("gemini-3.1-pro-preview")
  })

  test("clamps direct responses max_output_tokens to the supported minimum", async () => {
    setModels([createModel("responses-model", ["/responses"])])
    const app = createTestApp()

    const response = await app.request("http://localhost/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "responses-model",
        input: "hello",
        max_output_tokens: 1,
        stream: false,
      }),
    })

    expect(response.status).toBe(200)
    expect(upstreamRequests[0]?.pathname).toBe("/responses")
    expect(
      (upstreamRequests[0]?.body as { max_output_tokens?: number } | undefined)
        ?.max_output_tokens,
    ).toBe(16)
  })

  test("clamps responses fallback max_output_tokens converted from chat max_tokens", async () => {
    setModels([createModel("fallback-responses-model", ["/responses"])])
    const app = createTestApp()

    const response = await app.request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "fallback-responses-model",
        messages: [{ role: "user", content: "hello" }],
        max_tokens: 1,
        stream: false,
      }),
    })

    expect(response.status).toBe(200)
    expect(upstreamRequests[0]?.pathname).toBe("/responses")
    expect(
      (upstreamRequests[0]?.body as { max_output_tokens?: number } | undefined)
        ?.max_output_tokens,
    ).toBe(16)
  })

  test("routes gemini requests through responses fallback when chat is unsupported", async () => {
    setModels([createModel("gemini-responses-model", ["/responses"])])
    const app = createTestApp()

    const response = await app.request(
      "http://localhost/v1beta/models/gemini-responses-model:generateContent",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: "hello" }],
            },
          ],
        }),
      },
    )

    expect(response.status).toBe(200)
    expect(upstreamRequests[0]?.pathname).toBe("/responses")
  })
})
