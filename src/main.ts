#!/usr/bin/env node

import consola from "consola"
import { serve, type ServerHandler } from "srvx"

import { getActiveAccount } from "./lib/accounts"
import { mergeConfigWithDefaults } from "./lib/config"
import { copilotTokenManager } from "./lib/copilot-token-manager"
import { ensurePaths } from "./lib/paths"
import { initProxyFromEnv } from "./lib/proxy"
import { state } from "./lib/state"
import { cacheModels, cacheVSCodeVersion } from "./lib/utils"

// Configuration from environment variables
const PORT = Number.parseInt(process.env.PORT || "4141", 10)
const VERBOSE = process.env.VERBOSE === "true" || process.env.DEBUG === "true"
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
    state.githubToken = activeAccount.token
    state.accountType = activeAccount.accountType
    consola.info(`Logged in as ${activeAccount.login}`)

    if (state.showToken) {
      consola.info("GitHub token:", activeAccount.token)
    }

    await copilotTokenManager.getToken()
    await cacheModels()

    consola.info(
      `Available models: \n${state.models?.data.map((model) => `- ${model.id}`).join("\n")}`,
    )
  } else {
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
