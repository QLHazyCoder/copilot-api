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

  await saveConfig({
    ...originalConfig,
    accounts: [],
    activeAccountId: null,
    adminAuth: {
      ...originalConfig.adminAuth,
      secretHash: undefined,
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

describe("admin route protection", () => {
  test("redirects localhost admin root to setup when secret is not configured", async () => {
    const app = createAdminApp()

    const response = await app.request("http://localhost/admin")

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe("/admin/setup")
  })

  test("blocks remote setup access before secret initialization", async () => {
    const app = createAdminApp()

    const response = await app.request("http://admin.example/admin/setup", {
      headers: {
        host: "admin.example",
      },
    })

    expect(response.status).toBe(403)
  })

  test("supports localhost admin secret setup and creates a session", async () => {
    const app = createAdminApp()

    const setupResponse = await app.request(
      "http://localhost/admin/api/setup",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          secret: "setup-secret-value",
          confirmSecret: "setup-secret-value",
        }),
      },
    )

    expect(setupResponse.status).toBe(200)
    const cookie = getCookieHeader(setupResponse)

    const pageResponse = await app.request("http://localhost/admin", {
      headers: {
        cookie,
      },
    })

    expect(pageResponse.status).toBe(200)
    expect(await pageResponse.text()).toContain("Copilot API - Dashboard")
  })

  test("requires admin login for protected routes once secret is configured", async () => {
    const app = createAdminApp()
    const secretHash = await hashAdminSecret("my-admin-secret")

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

    const redirectResponse = await app.request("http://localhost/admin")
    expect(redirectResponse.status).toBe(302)
    expect(redirectResponse.headers.get("location")).toBe("/admin/login")

    const loginResponse = await app.request(
      "http://localhost/admin/api/session/login",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          secret: "my-admin-secret",
        }),
      },
    )

    expect(loginResponse.status).toBe(200)
    const cookie = getCookieHeader(loginResponse)

    const settingsResponse = await app.request(
      "http://localhost/admin/api/settings",
      {
        headers: {
          cookie,
        },
      },
    )
    expect(settingsResponse.status).toBe(200)

    const loginPageResponse = await app.request(
      "http://localhost/admin/login",
      {
        headers: {
          cookie,
        },
      },
    )
    expect(loginPageResponse.status).toBe(302)
    expect(loginPageResponse.headers.get("location")).toBe("/admin")

    const logoutResponse = await app.request(
      "http://localhost/admin/api/session/logout",
      {
        method: "POST",
        headers: {
          cookie,
        },
      },
    )
    expect(logoutResponse.status).toBe(200)

    const postLogoutResponse = await app.request("http://localhost/admin", {
      headers: {
        cookie,
      },
    })
    expect(postLogoutResponse.status).toBe(302)
    expect(postLogoutResponse.headers.get("location")).toBe("/admin/login")
  })

  test("updates admin session ttl days from settings", async () => {
    const app = createAdminApp()
    const secretHash = await hashAdminSecret("ttl-secret")

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
          secret: "ttl-secret",
        }),
      },
    )

    const cookie = getCookieHeader(loginResponse)

    const updateResponse = await app.request(
      "http://localhost/admin/api/settings",
      {
        method: "PUT",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          adminSessionTtlDays: 9,
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
      adminSessionTtlDays?: number
    }
    expect(settingsPayload.adminSessionTtlDays).toBe(9)
  })
})
