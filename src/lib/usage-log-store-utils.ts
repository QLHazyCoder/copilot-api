import { Database } from "bun:sqlite"

export function getSafeMultiplier(multiplier: number): number {
  if (!Number.isFinite(multiplier) || multiplier < 0) {
    return 0
  }

  return multiplier
}

export function getSafeStatusCode(
  statusCode: number | undefined,
): number | null {
  if (typeof statusCode === "number" && Number.isInteger(statusCode)) {
    return statusCode
  }

  return null
}

export function getSafeUsageLogEndpoint(
  endpoint: string | null | undefined,
): string | null {
  if (typeof endpoint !== "string") {
    return null
  }

  const trimmed = endpoint.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function getSafeUsageLogModel(model: string | undefined): string | null {
  if (typeof model !== "string") {
    return null
  }

  const trimmed = model.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function buildConversationVariantKey(payload: {
  endpoint: string
  model: string | null
  multiplier: number
}): string {
  return JSON.stringify({
    endpoint: payload.endpoint,
    model: payload.model,
    multiplier: payload.multiplier,
  })
}

export function ensureUsageLogColumn({
  db,
  columnNames,
  name,
  definition,
}: {
  db: Database
  columnNames: Set<string>
  name: string
  definition: string
}): void {
  if (!columnNames.has(name)) {
    db.run(`ALTER TABLE usage_logs ADD COLUMN ${definition};`)
  }
}

export function backfillUsageLogDefaults(db: Database): void {
  db.run(
    "UPDATE usage_logs SET request_count = 1 WHERE request_count IS NULL OR request_count < 1;",
  )
  db.run(
    "UPDATE usage_logs SET last_seen_at = created_at WHERE last_seen_at IS NULL;",
  )
  db.run(
    "UPDATE usage_logs SET quota_delta = ifnull(multiplier, 0) WHERE quota_delta IS NULL;",
  )
  db.run(
    "UPDATE usage_logs SET first_premium_used = premium_used WHERE first_premium_used IS NULL;",
  )
  db.run(
    "UPDATE usage_logs SET last_premium_used = premium_used WHERE last_premium_used IS NULL;",
  )
}

export function backfillConversationVariantKeys(db: Database): void {
  const rowsNeedingVariantKey = db
    .query(
      `
      SELECT
        id,
        endpoint,
        model,
        multiplier
      FROM usage_logs
      WHERE conversation_id IS NOT NULL
        AND (conversation_variant_key IS NULL OR conversation_variant_key = '')
    `,
    )
    .all() as Array<{
    id: string
    endpoint: string | null
    model: string | null
    multiplier: number | null
  }>

  const updateVariantKeyStatement = db.query(
    `
      UPDATE usage_logs
      SET conversation_variant_key = ?
      WHERE id = ?
    `,
  )

  for (const row of rowsNeedingVariantKey) {
    const endpoint = getSafeUsageLogEndpoint(row.endpoint) ?? ""
    if (!endpoint) {
      continue
    }

    updateVariantKeyStatement.run(
      buildConversationVariantKey({
        endpoint,
        model: getSafeUsageLogModel(row.model ?? undefined),
        multiplier: getSafeMultiplier(row.multiplier ?? 0),
      }),
      row.id,
    )
  }
}
