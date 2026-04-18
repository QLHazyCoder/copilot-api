import { AsyncLocalStorage } from "node:async_hooks"

import type { RuntimeAccountContext } from "./runtime-types"

const asyncLocalStorage = new AsyncLocalStorage<RuntimeAccountContext | null>()

export const runtimeContext = {
  getStore: () => asyncLocalStorage.getStore() ?? null,
  run: <T>(context: RuntimeAccountContext | null, callback: () => T) =>
    asyncLocalStorage.run(context, callback),
}
