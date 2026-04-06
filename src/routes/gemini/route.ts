import { Hono } from "hono"

import { forwardError } from "~/lib/error"

import { handleGeminiCompletion } from "./handler"

export const geminiRoutes = new Hono()

geminiRoutes.post("/*", async (c) => {
  try {
    return await handleGeminiCompletion(c)
  } catch (error) {
    return await forwardError(c, error)
  }
})
