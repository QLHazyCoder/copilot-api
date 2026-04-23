import { Hono } from "hono"

import { getConfig, shouldDisableHiddenModels } from "~/lib/config"
import { forwardError } from "~/lib/error"
import { runtimeManager } from "~/lib/runtime-manager"
import { cacheModels } from "~/lib/utils"

export const modelRoutes = new Hono()

modelRoutes.get("/", async (c) => {
  try {
    let modelsResponse = runtimeManager.getCurrentModels()
    if (!modelsResponse) {
      // This should be handled by startup logic, but as a fallback.
      await cacheModels()
      modelsResponse = runtimeManager.getCurrentModels()
    }

    const hiddenModels = new Set(getConfig().hiddenModels ?? [])
    const shouldFilterHiddenModels = shouldDisableHiddenModels()

    const models = modelsResponse?.data
      .filter((model) => !shouldFilterHiddenModels || !hiddenModels.has(model.id))
      .map((model) => ({
        id: model.id,
        object: "model",
        type: "model",
        created: 0, // No date available from source
        created_at: new Date(0).toISOString(), // No date available from source
        owned_by: model.vendor,
        display_name: model.name,
      }))

    return c.json({
      object: "list",
      data: models,
      has_more: false,
    })
  } catch (error) {
    return await forwardError(c, error)
  }
})

