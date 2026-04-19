import { afterAll, beforeEach, describe, expect, test } from "bun:test"

import {
  getConfig,
  mergeConfigWithDefaults,
  saveConfig,
  updateConfig,
} from "../src/lib/config"

const originalConfig = mergeConfigWithDefaults()

beforeEach(async () => {
  await saveConfig(originalConfig)
})

afterAll(async () => {
  await saveConfig(originalConfig)
})

describe("config store", () => {
  test("getConfig returns a deep frozen snapshot", async () => {
    await saveConfig({
      ...originalConfig,
      auth: {
        apiKey: "gateway-key",
        apiKeys: ["gateway-key"],
      },
    })

    const config = getConfig()
    const mutableConfig = config as { activeAccountId?: string | null }

    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config.auth ?? {})).toBe(true)
    expect(() => {
      mutableConfig.activeAccountId = "mutated"
    }).toThrow(TypeError)
  })

  test("updateConfig serializes concurrent updates without losing fields", async () => {
    await saveConfig({
      ...originalConfig,
      activeAccountId: null,
      rateLimitWait: false,
    })

    await Promise.all([
      updateConfig((config) => ({
        ...config,
        activeAccountId: "config-store-account",
      })),
      updateConfig((config) => ({
        ...config,
        rateLimitWait: true,
      })),
    ])

    const config = getConfig()
    expect(config.activeAccountId).toBe("config-store-account")
    expect(config.rateLimitWait).toBe(true)
  })
})
