import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { Hono } from "hono"

import {
  hashAdminSecret,
  resetAdminAuthRuntimeState,
} from "../src/lib/admin-auth"
import { mergeConfigWithDefaults, saveConfig } from "../src/lib/config"
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

beforeEach(async () => {
  resetAdminAuthRuntimeState()
  delete process.env.ADMIN_SECRET
  delete process.env.ADMIN_SECRET_HASH

  const secretHash = await hashAdminSecret("security-secret")
  await saveConfig({
    ...originalConfig,
    accounts: [],
    activeAccountId: null,
    adminAuth: {
      ...originalConfig.adminAuth,
      secretHash,
      sessionTtlDays: 5,
      enforceHttps: true,
    },
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

describe("admin session security", () => {
  test("rate limits repeated failed login attempts", async () => {
    const app = createAdminApp()

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.request(
        "http://localhost/admin/api/session/login",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            secret: "wrong-secret",
          }),
        },
      )

      expect(response.status).toBe(401)
    }

    const limitedResponse = await app.request(
      "http://localhost/admin/api/session/login",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          secret: "wrong-secret",
        }),
      },
    )

    expect(limitedResponse.status).toBe(429)
    expect(limitedResponse.headers.get("retry-after")).toBeTruthy()
  })

  test("rejects tampered cookies on protected routes", async () => {
    const app = createAdminApp()

    const loginResponse = await app.request(
      "http://localhost/admin/api/session/login",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          secret: "security-secret",
        }),
      },
    )

    const cookie = getCookieHeader(loginResponse)
    const tamperedCookie = cookie.replace(/.$/, "x")

    const response = await app.request("http://localhost/admin/api/settings", {
      headers: {
        cookie: tamperedCookie,
      },
    })

    expect(response.status).toBe(401)
  })

  test("rejects cross-origin admin write requests with a valid session", async () => {
    const app = createAdminApp()

    const loginResponse = await app.request(
      "http://localhost/admin/api/session/login",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          secret: "security-secret",
        }),
      },
    )

    const cookie = getCookieHeader(loginResponse)

    const response = await app.request(
      "https://admin.example/admin/api/session/logout",
      {
        method: "POST",
        headers: {
          cookie,
          host: "admin.example",
          origin: "https://evil.example",
          "x-forwarded-proto": "https",
        },
      },
    )

    expect(response.status).toBe(403)
  })
})
