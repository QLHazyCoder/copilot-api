import { describe, expect, test } from "bun:test"

import {
  hashAdminSecret,
  validateAdminSecret,
  verifyAdminSecretHash,
} from "../src/lib/admin-auth"

describe("admin auth helpers", () => {
  test("hashes and verifies admin secret", async () => {
    const secretHash = await hashAdminSecret("super-secret-value")

    expect(secretHash.startsWith("scrypt$")).toBe(true)
    expect(await verifyAdminSecretHash("super-secret-value", secretHash)).toBe(
      true,
    )
    expect(await verifyAdminSecretHash("wrong-secret", secretHash)).toBe(false)
  })

  test("validates minimum admin secret length", () => {
    expect(validateAdminSecret("short").valid).toBe(false)
    expect(validateAdminSecret("long-enough-secret").valid).toBe(true)
  })
})
