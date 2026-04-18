#!/usr/bin/env node

import consola from "consola"
import { serve, type ServerHandler } from "srvx"

import { getActiveAccount, setActiveAccount } from "./lib/accounts"
import { mergeConfigWithDefaults } from "./lib/config"
import { ensurePaths } from "./lib/paths"
import { initProxyFromEnv } from "./lib/proxy"
import { runtimeManager } from "./lib/runtime-manager"
import { state } from "./lib/state"
import { cacheVSCodeVersion } from "./lib/utils"

// Configuration from environment variables
const PORT = Number.parseInt(process.env.PORT || "4141", 10)
const VERBOSE = process.env.VERBOSE === "true" || process.env.DEBUG === "true"
const IS_DEVELOPMENT = process.env.NODE_ENV !== "production"
const RATE_LIMIT =
  process.env.RATE_LIMIT ?
    Number.parseInt(process.env.RATE_LIMIT, 10)
  : undefined
const RATE_LIMIT_WAIT = process.env.RATE_LIMIT_WAIT === "true"
const SHOW_TOKEN = process.env.SHOW_TOKEN === "true"
const PROXY_ENV = process.env.PROXY_ENV === "true"

async function main(): Promise<void> {
  // Ensure config is merged with defaults at startup
  const config = mergeConfigWithDefaults()

  if (PROXY_ENV) {
    initProxyFromEnv()
  }

  state.isDevelopment = IS_DEVELOPMENT
  state.verbose = VERBOSE
  if (VERBOSE) {
    consola.level = 5
    consola.info("Verbose logging enabled")
  }

  state.rateLimitSeconds = RATE_LIMIT ?? config.rateLimitSeconds
  state.rateLimitWait =
    process.env.RATE_LIMIT_WAIT === undefined ?
      (config.rateLimitWait ?? false)
    : RATE_LIMIT_WAIT
  state.showToken = SHOW_TOKEN

  await ensurePaths()
  await cacheVSCodeVersion()

  // Try to load active account from config
  const activeAccount = await getActiveAccount()

  if (activeAccount) {
    if (!config.activeAccountId) {
      await setActiveAccount(activeAccount.id)
    }

    consola.info(`Logged in as ${activeAccount.login}`)

    if (state.showToken) {
      consola.info("GitHub token:", activeAccount.token)
    }

    await runtimeManager.initialize(activeAccount)

    consola.info(
      `Available models: \n${state.models?.data.map((model) => `- ${model.id}`).join("\n")}`,
    )
  } else {
    runtimeManager.clearActiveContext()
    consola.warn("No account configured. Visit /admin to add an account.")
  }

  const serverUrl = `http://localhost:${PORT}`

  consola.box(`copilot-api server\n\n📋 Account Manager: ${serverUrl}/admin`)

  const { server } = await import("./server")

  serve({
    fetch: server.fetch as ServerHandler,
    port: PORT,
    bun: {
      idleTimeout: 0,
    },
  })
}

main().catch((error: unknown) => {
  consola.error("Failed to start server:", error)
  process.exit(1)
})
