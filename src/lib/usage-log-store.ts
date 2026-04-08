import { Database } from "bun:sqlite"
import fs from "node:fs"

import type { UsageLogCountMode } from "~/lib/config"

import { PATHS } from "~/lib/paths"
import {
  backfillConversationVariantKeys,
  backfillUsageLogDefaults,
  buildConversationVariantKey,
  ensureUsageLogColumn,
  getSafeMultiplier,
  getSafeStatusCode,
  getSafeUsageLogEndpoint,
  getSafeUsageLogModel,
} from "~/lib/usage-log-store-utils"

export type UsageResponseType = "streaming" | "non_streaming"

export interface UsageLogEntry {
  id: string
  createdAt: string
  lastSeenAt: string
  monthKey: string
  source: "request"
  accountId?: string
  conversationId?: string
  conversationVariantKey?: string
  endpoint?: string
  responseType?: UsageResponseType
  statusCode?: number
  model?: string
  multiplier?: number
  delta?: number
  quotaDelta: number
  requestCount: number
  premiumUsed: number
  premiumRemaining: number
  premiumEntitlement: number
  chatUsed: number
  completionsUsed: number
}

export type UsageLogSourceFilter = "all" | "request"

export interface UsageLogCursor {
  createdAt: string
  id: string
}

export interface ListUsageLogsOptions {
  limit?: number
  accountId?: string | null
  source?: UsageLogSourceFilter
  endpoint?: string | null
  cursor?: UsageLogCursor | null
}

export interface ListUsageLogEndpointsOptions {
  accountId?: string | null
  source?: UsageLogSourceFilter
}

export interface ListUsageLogsResult {
  logs: Array<UsageLogEntry>
  hasMore: boolean
  nextCursor: UsageLogCursor | null
}

interface UsageSummaryPayload {
  premiumUsed: number
  premiumRemaining: number
  premiumEntitlement: number
  chatUsed: number
  completionsUsed: number
}

interface UsageRequestPayload {
  accountId?: string | null
  endpoint: string
  responseType?: UsageResponseType
  statusCode?: number
  model?: string
  multiplier: number
  delta: number
  conversationId?: string | null
  countMode: UsageLogCountMode
}

export interface AppendUsageRequestLogResult {
  logId: string
  inserted: boolean
  effectiveCountMode: UsageLogCountMode
  conversationId: string | null
  conversationVariantKey: string | null
  reason:
    | "request-mode"
    | "conversation-inserted"
    | "conversation-variant-inserted"
    | "conversation-deduped"
    | "conversation-missing-id"
}

let usageLogDb: Database | null = null

interface UsageLogRow {
  id: string
  created_at: string
  last_seen_at: string | null
  month_key: string
  source: "request"
  account_id: string | null
  conversation_id: string | null
  conversation_variant_key: string | null
  endpoint: string | null
  response_type: string | null
  status_code: number | null
  model: string | null
  multiplier: number | null
  delta: number | null
  first_premium_used: number | null
  last_premium_used: number | null
  quota_delta: number | null
  request_count: number | null
  premium_used: number
  premium_remaining: number
  premium_entitlement: number
  chat_used: number
  completions_used: number
}

const DEFAULT_USAGE_LOG_LIMIT = 50
const MAX_USAGE_LOG_LIMIT = 200

function deleteOutdatedMonthLogs(db: Database, monthKey: string): void {
  db.query("DELETE FROM usage_logs WHERE month_key != ?").run(monthKey)
}

function getSafeDelta(delta: number): number {
  if (!Number.isFinite(delta)) {
    return 0
  }

  return delta
}

function getSafeResponseType(
  responseType: UsageResponseType | undefined,
): UsageResponseType | null {
  if (responseType === "streaming" || responseType === "non_streaming") {
    return responseType
  }

  return null
}

function getSafeAccountId(accountId: string | null | undefined): string | null {
  if (typeof accountId === "string" && accountId.length > 0) {
    return accountId
  }

  return null
}

function getSafeConversationId(
  conversationId: string | null | undefined,
): string | null {
  if (typeof conversationId !== "string") {
    return null
  }

  const trimmed = conversationId.trim()
  return trimmed.length > 0 ? trimmed : null
}

function getSafeUsageLogLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || typeof limit !== "number") {
    return DEFAULT_USAGE_LOG_LIMIT
  }

  return Math.min(MAX_USAGE_LOG_LIMIT, Math.max(1, Math.floor(limit)))
}

function getSafeUsageLogSource(
  source: UsageLogSourceFilter | undefined,
): "request" | null {
  if (source === "request") {
    return source
  }

  return null
}

function mapUsageLogRow(row: UsageLogRow): UsageLogEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at ?? row.created_at,
    monthKey: row.month_key,
    source: row.source,
    accountId: row.account_id ?? undefined,
    conversationId: row.conversation_id ?? undefined,
    conversationVariantKey: row.conversation_variant_key ?? undefined,
    endpoint: row.endpoint ?? undefined,
    responseType:
      (
        row.response_type === "streaming"
        || row.response_type === "non_streaming"
      ) ?
        row.response_type
      : undefined,
    statusCode: row.status_code ?? undefined,
    model: row.model ?? undefined,
    multiplier: row.multiplier ?? undefined,
    delta: row.delta ?? undefined,
    quotaDelta:
      typeof row.quota_delta === "number" && Number.isFinite(row.quota_delta) ?
        row.quota_delta
      : 0,
    requestCount:
      typeof row.request_count === "number" && row.request_count > 0 ?
        row.request_count
      : 1,
    premiumUsed: row.premium_used,
    premiumRemaining: row.premium_remaining,
    premiumEntitlement: row.premium_entitlement,
    chatUsed: row.chat_used,
    completionsUsed: row.completions_used,
  }
}

function getUsageLogDb(): Database {
  if (usageLogDb) {
    return usageLogDb
  }

  fs.mkdirSync(PATHS.APP_DIR, { recursive: true })
  usageLogDb = new Database(PATHS.USAGE_LOG_DB_PATH)

  usageLogDb.run(`
    CREATE TABLE IF NOT EXISTS usage_logs (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      last_seen_at TEXT,
      month_key TEXT NOT NULL,
      source TEXT NOT NULL,
      account_id TEXT,
      conversation_id TEXT,
      conversation_variant_key TEXT,
      endpoint TEXT,
      response_type TEXT,
      status_code INTEGER,
      model TEXT,
      multiplier REAL,
      delta REAL,
      first_premium_used INTEGER,
      last_premium_used INTEGER,
      quota_delta REAL NOT NULL DEFAULT 0,
      request_count INTEGER NOT NULL DEFAULT 1,
      plan TEXT NOT NULL,
      premium_used INTEGER NOT NULL,
      premium_remaining INTEGER NOT NULL,
      premium_entitlement INTEGER NOT NULL,
      chat_used INTEGER NOT NULL,
      completions_used INTEGER NOT NULL
    );
  `)

  ensureUsageLogColumns(usageLogDb)

  usageLogDb.run("DELETE FROM usage_logs WHERE source = 'usage_snapshot';")

  usageLogDb.run(
    "CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at DESC);",
  )

  usageLogDb.run(
    "CREATE INDEX IF NOT EXISTS idx_usage_logs_month_key ON usage_logs(month_key);",
  )

  usageLogDb.run(
    "CREATE INDEX IF NOT EXISTS idx_usage_logs_account_created_id ON usage_logs(account_id, created_at DESC, id DESC);",
  )

  usageLogDb.run(
    "CREATE INDEX IF NOT EXISTS idx_usage_logs_account_source_created_id ON usage_logs(account_id, source, created_at DESC, id DESC);",
  )

  usageLogDb.run(
    "DROP INDEX IF EXISTS idx_usage_logs_month_account_conversation;",
  )
  usageLogDb.run("DROP INDEX IF EXISTS idx_usage_logs_conversation_dedupe;")

  usageLogDb.run(
    "CREATE INDEX IF NOT EXISTS idx_usage_logs_month_account_conversation ON usage_logs(month_key, account_id, conversation_id, conversation_variant_key);",
  )

  usageLogDb.run(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_logs_conversation_dedupe ON usage_logs(month_key, ifnull(account_id, ''), conversation_id, conversation_variant_key) WHERE conversation_id IS NOT NULL AND conversation_variant_key IS NOT NULL;",
  )

  return usageLogDb
}

function ensureUsageLogColumns(db: Database): void {
  const columns = db.query("PRAGMA table_info(usage_logs)").all() as Array<{
    name: string
  }>
  const columnNames = new Set(columns.map((column) => column.name))

  ensureUsageLogColumn({
    db,
    columnNames,
    name: "endpoint",
    definition: "endpoint TEXT",
  })
  ensureUsageLogColumn({
    db,
    columnNames,
    name: "account_id",
    definition: "account_id TEXT",
  })
  ensureUsageLogColumn({
    db,
    columnNames,
    name: "response_type",
    definition: "response_type TEXT",
  })
  ensureUsageLogColumn({
    db,
    columnNames,
    name: "status_code",
    definition: "status_code INTEGER",
  })
  ensureUsageLogColumn({
    db,
    columnNames,
    name: "model",
    definition: "model TEXT",
  })
  ensureUsageLogColumn({
    db,
    columnNames,
    name: "multiplier",
    definition: "multiplier REAL",
  })
  ensureUsageLogColumn({
    db,
    columnNames,
    name: "delta",
    definition: "delta REAL",
  })
  ensureUsageLogColumn({
    db,
    columnNames,
    name: "first_premium_used",
    definition: "first_premium_used INTEGER",
  })
  ensureUsageLogColumn({
    db,
    columnNames,
    name: "last_premium_used",
    definition: "last_premium_used INTEGER",
  })
  ensureUsageLogColumn({
    db,
    columnNames,
    name: "quota_delta",
    definition: "quota_delta REAL NOT NULL DEFAULT 0",
  })
  ensureUsageLogColumn({
    db,
    columnNames,
    name: "conversation_id",
    definition: "conversation_id TEXT",
  })
  ensureUsageLogColumn({
    db,
    columnNames,
    name: "conversation_variant_key",
    definition: "conversation_variant_key TEXT",
  })
  ensureUsageLogColumn({
    db,
    columnNames,
    name: "request_count",
    definition: "request_count INTEGER NOT NULL DEFAULT 1",
  })
  ensureUsageLogColumn({
    db,
    columnNames,
    name: "last_seen_at",
    definition: "last_seen_at TEXT",
  })

  backfillUsageLogDefaults(db)
  backfillConversationVariantKeys(db)
}

function getMonthKey(date: Date): string {
  return date.toISOString().slice(0, 7)
}

function insertUsageRequestLog(
  db: Database,
  payload: {
    logId: string
    createdAt: string
    monthKey: string
    accountId: string | null
    conversationId: string | null
    conversationVariantKey: string | null
    endpoint: string
    responseType: UsageResponseType | null
    statusCode: number | null
    model: string | null
    multiplier: number
    delta: number
  },
): { changes: number } {
  return db
    .query(
      `
      INSERT OR IGNORE INTO usage_logs (
        id,
        created_at,
        last_seen_at,
        month_key,
        source,
        account_id,
        conversation_id,
        conversation_variant_key,
        endpoint,
        response_type,
        status_code,
        model,
        multiplier,
        delta,
        first_premium_used,
        last_premium_used,
        quota_delta,
        request_count,
        plan,
        premium_used,
        premium_remaining,
        premium_entitlement,
        chat_used,
        completions_used
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      payload.logId,
      payload.createdAt,
      payload.createdAt,
      payload.monthKey,
      "request",
      payload.accountId,
      payload.conversationId,
      payload.conversationVariantKey,
      payload.endpoint,
      payload.responseType,
      payload.statusCode,
      payload.model,
      payload.multiplier,
      payload.delta,
      null,
      null,
      payload.multiplier,
      1,
      "unknown",
      0,
      0,
      0,
      0,
      0,
    ) as { changes: number }
}

function findExistingConversationLogId(
  db: Database,
  payload: {
    monthKey: string
    accountId: string | null
    conversationId: string
    conversationVariantKey: string
  },
): string {
  const existingRow = db
    .query(
      `
      SELECT id
      FROM usage_logs
      WHERE month_key = ?
        AND ifnull(account_id, '') = ifnull(?, '')
        AND source = 'request'
        AND conversation_id = ?
        AND conversation_variant_key = ?
      LIMIT 1
    `,
    )
    .get(
      payload.monthKey,
      payload.accountId,
      payload.conversationId,
      payload.conversationVariantKey,
    ) as {
    id: string
  } | null

  if (!existingRow?.id) {
    throw new Error("Failed to resolve existing conversation usage log row")
  }

  return existingRow.id
}

function getConversationUsageLogCount(
  db: Database,
  payload: {
    monthKey: string
    accountId: string | null
    conversationId: string
  },
): number {
  const row = db
    .query(
      `
      SELECT COUNT(*) AS count
      FROM usage_logs
      WHERE month_key = ?
        AND ifnull(account_id, '') = ifnull(?, '')
        AND source = 'request'
        AND conversation_id = ?
    `,
    )
    .get(payload.monthKey, payload.accountId, payload.conversationId) as {
    count: number
  } | null

  return typeof row?.count === "number" ? row.count : 0
}

function bumpConversationUsageLog(
  db: Database,
  payload: {
    logId: string
    lastSeenAt: string
  },
): void {
  db.query(
    `
      UPDATE usage_logs
      SET
        request_count = request_count + 1,
        last_seen_at = ?
      WHERE id = ? AND source = 'request'
    `,
  ).run(payload.lastSeenAt, payload.logId)
}

export function appendUsageRequestLog(
  payload: UsageRequestPayload,
): AppendUsageRequestLogResult {
  const db = getUsageLogDb()
  const now = new Date()
  const createdAt = now.toISOString()
  const monthKey = getMonthKey(now)

  deleteOutdatedMonthLogs(db, monthKey)

  const safeAccountId = getSafeAccountId(payload.accountId)
  const safeEndpoint =
    getSafeUsageLogEndpoint(payload.endpoint) ?? payload.endpoint
  const safeModel = getSafeUsageLogModel(payload.model)
  const safeMultiplier = getSafeMultiplier(payload.multiplier)
  const safeDelta = getSafeDelta(payload.delta)
  const safeResponseType = getSafeResponseType(payload.responseType)
  const safeStatusCode = getSafeStatusCode(payload.statusCode)
  const safeConversationId =
    payload.countMode === "conversation" ?
      getSafeConversationId(payload.conversationId)
    : null
  const safeConversationVariantKey =
    safeConversationId ?
      buildConversationVariantKey({
        endpoint: safeEndpoint,
        model: safeModel,
        multiplier: safeMultiplier,
      })
    : null
  const logId = crypto.randomUUID()
  const insertPayload = {
    logId,
    createdAt,
    monthKey,
    accountId: safeAccountId,
    conversationId: safeConversationId,
    conversationVariantKey: safeConversationVariantKey,
    endpoint: safeEndpoint,
    responseType: safeResponseType,
    statusCode: safeStatusCode,
    model: safeModel,
    multiplier: safeMultiplier,
    delta: safeDelta,
  }

  if (!safeConversationId) {
    insertUsageRequestLog(db, insertPayload)
    return {
      logId,
      inserted: true,
      effectiveCountMode: "request",
      conversationId: null,
      conversationVariantKey: null,
      reason:
        payload.countMode === "conversation" ?
          "conversation-missing-id"
        : "request-mode",
    }
  }

  if (!safeConversationVariantKey) {
    throw new Error(
      "Failed to build conversation variant key for conversation usage log",
    )
  }

  const insertResult = insertUsageRequestLog(db, insertPayload)
  if (insertResult.changes > 0) {
    const existingConversationLogCount = getConversationUsageLogCount(db, {
      monthKey,
      accountId: safeAccountId,
      conversationId: safeConversationId,
    })
    return {
      logId,
      inserted: true,
      effectiveCountMode: "conversation",
      conversationId: safeConversationId,
      conversationVariantKey: safeConversationVariantKey,
      reason:
        existingConversationLogCount > 1 ?
          "conversation-variant-inserted"
        : "conversation-inserted",
    }
  }

  const existingLogId = findExistingConversationLogId(db, {
    monthKey,
    accountId: safeAccountId,
    conversationId: safeConversationId,
    conversationVariantKey: safeConversationVariantKey,
  })
  bumpConversationUsageLog(db, {
    logId: existingLogId,
    lastSeenAt: createdAt,
  })
  return {
    logId: existingLogId,
    inserted: false,
    effectiveCountMode: "conversation",
    conversationId: safeConversationId,
    conversationVariantKey: safeConversationVariantKey,
    reason: "conversation-deduped",
  }
}

export function updateRequestUsageLogSummary(
  logId: string,
  payload: UsageSummaryPayload,
): void {
  const db = getUsageLogDb()
  const row = db
    .query(
      `
        SELECT
          multiplier,
          first_premium_used
        FROM usage_logs
        WHERE id = ? AND source = 'request'
        LIMIT 1
      `,
    )
    .get(logId) as {
    multiplier: number | null
    first_premium_used: number | null
  } | null

  if (!row) {
    return
  }

  const safeMultiplier = getSafeMultiplier(row.multiplier ?? 0)
  const firstPremiumUsed =
    typeof row.first_premium_used === "number" ?
      row.first_premium_used
    : payload.premiumUsed
  const quotaDelta =
    Math.max(0, payload.premiumUsed - firstPremiumUsed) + safeMultiplier

  db.query(
    `
      UPDATE usage_logs
      SET
        first_premium_used = ?,
        last_premium_used = ?,
        quota_delta = ?,
        premium_used = ?,
        premium_remaining = ?,
        premium_entitlement = ?,
        chat_used = ?,
        completions_used = ?
      WHERE id = ? AND source = 'request'
    `,
  ).run(
    Math.max(0, Math.round(firstPremiumUsed)),
    Math.max(0, Math.round(payload.premiumUsed)),
    quotaDelta,
    Math.max(0, Math.round(payload.premiumUsed)),
    Math.max(0, Math.round(payload.premiumRemaining)),
    Math.max(0, Math.round(payload.premiumEntitlement)),
    Math.max(0, Math.round(payload.chatUsed)),
    Math.max(0, Math.round(payload.completionsUsed)),
    logId,
  )
}

export function listUsageLogs(
  options: ListUsageLogsOptions = {},
): ListUsageLogsResult {
  const db = getUsageLogDb()
  const safeLimit = getSafeUsageLogLimit(options.limit)
  const safeAccountId = getSafeAccountId(options.accountId)
  const safeSource = getSafeUsageLogSource(options.source)
  const safeEndpoint = getSafeUsageLogEndpoint(options.endpoint)
  const safeCursor =
    (
      options.cursor
      && typeof options.cursor.createdAt === "string"
      && typeof options.cursor.id === "string"
    ) ?
      options.cursor
    : null

  let query = `
    SELECT
      id,
      created_at,
      last_seen_at,
      month_key,
      source,
      account_id,
      conversation_id,
      conversation_variant_key,
      endpoint,
      response_type,
      status_code,
      model,
      multiplier,
      delta,
      quota_delta,
      request_count,
      premium_used,
      premium_remaining,
      premium_entitlement,
      chat_used,
      completions_used
    FROM usage_logs
    WHERE account_id IS ?
  `
  const params: Array<string | number | null> = [safeAccountId]

  if (safeSource) {
    query += " AND source = ?"
    params.push(safeSource)
  }

  if (safeEndpoint) {
    query += " AND endpoint = ?"
    params.push(safeEndpoint)
  }

  if (safeCursor) {
    query += " AND (last_seen_at < ? OR (last_seen_at = ? AND id < ?))"
    params.push(safeCursor.createdAt, safeCursor.createdAt, safeCursor.id)
  }

  query += " ORDER BY last_seen_at DESC, id DESC LIMIT ?"
  params.push(safeLimit + 1)

  const rows = db.query(query).all(...params) as Array<UsageLogRow>
  const hasMore = rows.length > safeLimit
  const slicedRows = hasMore ? rows.slice(0, safeLimit) : rows
  const logs = slicedRows.map((row) => mapUsageLogRow(row))

  const lastRow = slicedRows.at(-1)
  const nextCursor =
    hasMore && lastRow ?
      {
        createdAt: lastRow.last_seen_at ?? lastRow.created_at,
        id: lastRow.id,
      }
    : null

  return {
    logs,
    hasMore,
    nextCursor,
  }
}

export function listUsageLogEndpoints(
  options: ListUsageLogEndpointsOptions = {},
): Array<string> {
  const db = getUsageLogDb()
  const safeAccountId = getSafeAccountId(options.accountId)
  const safeSource = getSafeUsageLogSource(options.source)

  let query = `
    SELECT DISTINCT endpoint
    FROM usage_logs
    WHERE account_id IS ? AND endpoint IS NOT NULL AND endpoint != ''
  `
  const params: Array<string | number | null> = [safeAccountId]

  if (safeSource) {
    query += " AND source = ?"
    params.push(safeSource)
  }

  query += " ORDER BY endpoint ASC"

  const rows = db.query(query).all(...params) as Array<{
    endpoint: string | null
  }>

  return rows
    .map((row) => getSafeUsageLogEndpoint(row.endpoint))
    .filter((endpoint): endpoint is string => endpoint !== null)
}
