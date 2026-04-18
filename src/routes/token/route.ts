import { Hono } from "hono"

import { copilotTokenManager } from "~/lib/copilot-token-manager"
import { runtimeManager } from "~/lib/runtime-manager"

export const tokenRoute = new Hono()

tokenRoute.get("/", (c) => {
  try {
    const activeContext = runtimeManager.getActiveContext()
    return c.json({
      token:
        activeContext ?
          copilotTokenManager.getCachedToken(activeContext)
        : null,
    })
  } catch (error) {
    console.error("Error fetching token:", error)
    return c.json({ error: "Failed to fetch token", token: null }, 500)
  }
})
