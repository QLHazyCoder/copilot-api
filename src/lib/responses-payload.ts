import type { ResponsesPayload } from "~/services/copilot/create-responses"
import type { Model } from "~/services/copilot/get-models"

export const MIN_RESPONSES_MAX_OUTPUT_TOKENS = 16

export function normalizeResponsesPayload(
  payload: ResponsesPayload,
  model: Model | undefined,
): void {
  const rawMaxOutputTokens = (
    payload as ResponsesPayload & {
      max_output_tokens?: unknown
    }
  ).max_output_tokens

  if (
    rawMaxOutputTokens === null
    || rawMaxOutputTokens === undefined
    || typeof rawMaxOutputTokens !== "number"
    || !Number.isFinite(rawMaxOutputTokens)
  ) {
    return
  }

  let normalizedMaxOutputTokens = Math.floor(rawMaxOutputTokens)
  normalizedMaxOutputTokens = Math.max(
    normalizedMaxOutputTokens,
    MIN_RESPONSES_MAX_OUTPUT_TOKENS,
  )

  const modelLimit = model?.capabilities.limits.max_output_tokens
  if (
    typeof modelLimit === "number"
    && Number.isFinite(modelLimit)
    && modelLimit > 0
  ) {
    normalizedMaxOutputTokens = Math.min(
      normalizedMaxOutputTokens,
      Math.max(modelLimit, MIN_RESPONSES_MAX_OUTPUT_TOKENS),
    )
  }

  if (normalizedMaxOutputTokens !== rawMaxOutputTokens) {
    payload.max_output_tokens = normalizedMaxOutputTokens
  }
}
