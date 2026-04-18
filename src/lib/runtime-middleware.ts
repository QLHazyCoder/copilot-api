import type { MiddlewareHandler } from "hono"

import { runtimeContext } from "./runtime-context"
import { runtimeManager } from "./runtime-manager"

export const runtimeMiddleware: MiddlewareHandler = async (_c, next) => {
  await runtimeContext.run(runtimeManager.getActiveContext(), async () => {
    await next()
  })
}
