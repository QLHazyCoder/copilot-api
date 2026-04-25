import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { Hono } from "hono"

import {
  hashAdminSecret,
  resetAdminAuthRuntimeState,
} from "../src/lib/admin-auth"
import {
  getConfig,
  mergeConfigWithDefaults,
  saveConfig,
} from "../src/lib/config"
import { adminRoutes } from "../src/routes/admin/route"

const originalConfig = mergeConfigWithDefaults()
const originalAdminSecret = process.env.ADMIN_SECRET
const originalAdminSecretHash = process.env.ADMIN_SECRET_HASH

function createAdminApp(): Hono {
  const app = new Hono()
  app.route("/admin", adminRoutes)
  return app
}

function getCookieHeader(response: Response): string {
  const setCookie = response.headers.get("set-cookie")
  expect(setCookie).toBeTruthy()

  if (!setCookie) {
    throw new Error("expected set-cookie header")
  }

  return setCookie.split(";")[0]
}

async function setupLoggedInAdmin(app: Hono): Promise<string> {
  const secretHash = await hashAdminSecret("context-secret")

  await saveConfig({
    ...mergeConfigWithDefaults(),
    accounts: [],
    activeAccountId: null,
    adminAuth: {
      ...mergeConfigWithDefaults().adminAuth,
      secretHash,
      sessionTtlDays: 5,
      enforceHttps: true,
    },
  })

  const loginResponse = await app.request(
    "http://localhost/admin/api/session/login",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        secret: "context-secret",
      }),
    },
  )

  return getCookieHeader(loginResponse)
}

beforeEach(async () => {
  resetAdminAuthRuntimeState()
  delete process.env.ADMIN_SECRET
  delete process.env.ADMIN_SECRET_HASH

  await saveConfig({
    ...originalConfig,
    accounts: [],
    activeAccountId: null,
  })
})

afterAll(async () => {
  if (originalAdminSecret === undefined) {
    delete process.env.ADMIN_SECRET
  } else {
    process.env.ADMIN_SECRET = originalAdminSecret
  }

  if (originalAdminSecretHash === undefined) {
    delete process.env.ADMIN_SECRET_HASH
  } else {
    process.env.ADMIN_SECRET_HASH = originalAdminSecretHash
  }

  await saveConfig(originalConfig)
})

describe("admin context management settings", () => {
  test("updates context compression settings from admin settings", async () => {
    const app = createAdminApp()
    const cookie = await setupLoggedInAdmin(app)

    const updateResponse = await app.request(
      "http://localhost/admin/api/settings",
      {
        method: "PUT",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contextManagement: {
            enabled: true,
            summarizeAtPercent: 82,
            keepRecentTurns: 5,
            summarizerModel: "gpt-5-mini",
          },
        }),
      },
    )

    expect(updateResponse.status).toBe(200)

    const settingsResponse = await app.request(
      "http://localhost/admin/api/settings",
      {
        headers: {
          cookie,
        },
      },
    )

    expect(settingsResponse.status).toBe(200)
    const settingsPayload = (await settingsResponse.json()) as {
      contextManagement?: {
        enabled?: boolean
        summarizeAtPercent?: number
        keepRecentTurns?: number
        summarizerModel?: string | null
      }
    }
    expect(settingsPayload.contextManagement).toEqual({
      enabled: true,
      summarizeAtPercent: 82,
      keepRecentTurns: 5,
      summarizerModel: "gpt-5-mini",
    })
    expect(getConfig().contextManagement).toMatchObject({
      mode: "summarize_then_trim",
      summarizeAtRatio: 0.82,
      keepRecentTurns: 5,
      summarizerModel: "gpt-5-mini",
    })
  })
})
