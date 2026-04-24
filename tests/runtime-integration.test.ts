import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test"
import { Hono } from "hono"

import type { Account } from "../src/lib/accounts"

import {
  hashAdminSecret,
  resetAdminAuthRuntimeState,
} from "../src/lib/admin-auth"
import { mergeConfigWithDefaults, saveConfig } from "../src/lib/config"
import { copilotTokenManager } from "../src/lib/copilot-token-manager"
import { runtimeManager } from "../src/lib/runtime-manager"
import { runtimeMiddleware } from "../src/lib/runtime-middleware"
import { state } from "../src/lib/state"
import { adminRoutes } from "../src/routes/admin/route"
import { usageRoute } from "../src/routes/usage/route"

const originalFetch = globalThis.fetch

interface FetchRecord {
  authorization: string | null
  pathname: string
}

const fetchRecords = new Array<FetchRecord>()

const accountA: Account = {
  id: "account-a",
  login: "account-a",
  avatarUrl: "https://example.com/a.png",
  token: "gh-token-a",
  accountType: "individual",
  createdAt: "2026-01-01T00:00:00.000Z",
}

const accountB: Account = {
  id: "account-b",
  login: "account-b",
  avatarUrl: "https://example.com/b.png",
  token: "gh-token-b",
  accountType: "business",
  createdAt: "2026-01-02T00:00:00.000Z",
}

const adminSecret = "runtime-admin-secret"

function createUsageResponse(): Response {
  return Response.json({
    access_type_sku: "test",
    analytics_tracking_id: "analytics",
    assigned_date: "2026-01-01",
    can_signup_for_limited: false,
    chat_enabled: true,
    copilot_plan: "pro",
    organization_login_list: [],
    organization_list: [],
    quota_reset_date: "2099-01-01",
    quota_snapshots: {
      premium_interactions: {
        entitlement: 100,
        overage_count: 0,
        overage_permitted: false,
        percent_remaining: 100,
        quota_id: "premium",
        quota_remaining: 100,
        remaining: 100,
        unlimited: false,
      },
      chat: {
        entitlement: 100,
        overage_count: 0,
        overage_permitted: false,
        percent_remaining: 100,
        quota_id: "chat",
        quota_remaining: 100,
        remaining: 100,
        unlimited: false,
      },
      completions: {
        entitlement: 100,
        overage_count: 0,
        overage_permitted: false,
        percent_remaining: 100,
        quota_id: "completions",
        quota_remaining: 100,
        remaining: 100,
        unlimited: false,
      },
    },
  })
}

function createChatResponse(model: string): Response {
  return Response.json({
    id: "chat_1",
    object: "chat.completion",
    created: 1,
    model,
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

function createModelsResponse(modelId: string): Response {
  return Response.json({
    object: "list",
    data: [
      {
        id: modelId,
        name: modelId,
        object: "model",
        preview: false,
        vendor: "test",
        version: "1",
        model_picker_enabled: true,
        supported_endpoints: [
          "/chat/completions",
          "/responses",
          "/v1/messages",
        ],
        capabilities: {
          family: "test",
          limits: {
            max_output_tokens: 1024,
            max_prompt_tokens: 4096,
          },
          object: "capabilities",
          supports: {
            streaming: true,
          },
          tokenizer: "o200k_base",
          type: "chat",
        },
      },
    ],
  })
}

function createTestApp(path: "/admin" | "/usage"): Hono {
  const app = new Hono()
  app.use("*", runtimeMiddleware)

  if (path === "/admin") {
    app.route("/admin", adminRoutes)
    return app
  }

  app.route("/usage", usageRoute)
  return app
}

async function createAdminSessionCookie(app: Hono): Promise<string> {
  const response = await app.request("http://localhost/admin/api/session/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      secret: adminSecret,
    }),
  })

  const setCookie = response.headers.get("set-cookie")
  if (!setCookie) {
    throw new Error("Expected admin login to return a session cookie")
  }

  return setCookie.split(";")[0]
}

beforeEach(async () => {
  resetAdminAuthRuntimeState()
  fetchRecords.length = 0
  runtimeManager.clearAccount(accountA.id)
  runtimeManager.clearAccount(accountB.id)
  runtimeManager.clearActiveContext()
  copilotTokenManager.clear()
  state.copilotToken = undefined
  state.githubToken = undefined
  state.models = undefined
  state.vsCodeVersion = "1.0.0"
  state.rateLimitSeconds = undefined
  state.lastRequestTimestamp = undefined
  state.rateLimitWait = false

  const config = mergeConfigWithDefaults()
  const secretHash = await hashAdminSecret(adminSecret)
  await saveConfig({
    ...config,
    accounts: [accountA, accountB],
    activeAccountId: accountA.id,
    usageTestIntervalMinutes: 10,
    adminAuth: {
      ...config.adminAuth,
      secretHash,
      sessionTtlDays: 5,
      enforceHttps: true,
    },
  })

  globalThis.fetch = ((input, init) => {
    let url: string
    if (typeof input === "string") {
      url = input
    } else if (input instanceof URL) {
      url = input.toString()
    } else {
      url = input.url
    }
    const pathname = new URL(url).pathname
    const authorization = new Headers(init?.headers).get("authorization")
    fetchRecords.push({
      authorization,
      pathname,
    })

    if (pathname === "/copilot_internal/v2/token") {
      const token =
        authorization === "token gh-token-b" ? "cp-token-b" : "cp-token-a"
      return Promise.resolve(
        Response.json({
          token,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_in: 3600,
        }),
      )
    }

    if (pathname === "/models") {
      const response =
        authorization === "Bearer cp-token-b" ?
          createModelsResponse("model-b")
        : createModelsResponse("model-a")
      return Promise.resolve(response)
    }

    if (pathname === "/copilot_internal/user") {
      return Promise.resolve(createUsageResponse())
    }

    const response =
      authorization === "Bearer cp-token-b" ?
        createChatResponse("model-b")
      : createChatResponse("model-a")
    return Promise.resolve(response)
  }) as typeof fetch

  await runtimeManager.initialize(accountA)
  fetchRecords.length = 0
})

afterAll(() => {
  globalThis.fetch = originalFetch
})

afterEach(() => {
  runtimeManager.clearAccount(accountA.id)
  runtimeManager.clearAccount(accountB.id)
  runtimeManager.clearActiveContext()
  copilotTokenManager.clear()
  state.copilotToken = undefined
  state.githubToken = undefined
  state.models = undefined
})

describe("runtime integration", () => {
  test("activating another account refreshes active runtime models", async () => {
    const app = createTestApp("/admin")
    const cookie = await createAdminSessionCookie(app)

    const response = await app.request(
      `http://localhost/admin/api/accounts/${accountB.id}/activate`,
      {
        method: "POST",
        headers: {
          cookie,
        },
      },
    )

    const config = mergeConfigWithDefaults()

    expect(response.status).toBe(200)
    expect(runtimeManager.getActiveContext()?.accountId).toBe(accountB.id)
    expect(runtimeManager.getActiveModels()?.data[0]?.id).toBe("model-b")
    expect(state.models?.data[0]?.id).toBe("model-b")
    expect(config.activeAccountId).toBe(accountB.id)
  })

  test("usage health check is triggered lazily and reused for the same account", async () => {
    const app = createTestApp("/usage")

    expect(
      fetchRecords.filter((record) => record.pathname === "/chat/completions"),
    ).toHaveLength(0)

    const firstResponse = await app.request("http://localhost/usage", {
      method: "GET",
    })
    const secondResponse = await app.request("http://localhost/usage", {
      method: "GET",
    })

    const usageFetchCount = fetchRecords.filter(
      (record) => record.pathname === "/copilot_internal/user",
    ).length
    const healthCheckCount = fetchRecords.filter(
      (record) => record.pathname === "/chat/completions",
    ).length

    expect(firstResponse.status).toBe(200)
    expect(secondResponse.status).toBe(200)
    expect(usageFetchCount).toBe(2)
    expect(healthCheckCount).toBe(1)
  })
})
