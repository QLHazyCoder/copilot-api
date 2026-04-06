import { Database } from "bun:sqlite"
import fs from "node:fs"

import { PATHS } from "~/lib/paths"

export type UsageResponseType = "streaming" | "non_streaming"

export interface UsageLogEntry {
  id: string
  createdAt: string
  monthKey: string
  source: "request"
  accountId?: string
  endpoint?: string
  responseType?: UsageResponseType
  statusCode?: number
  model?: string
  multiplier?: number
  delta?: number
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
}

let usageLogDb: Database | null = null

interface UsageLogRow {
  id: string
  created_at: string
  month_key: string
  source: "request"
  account_id: string | null
  endpoint: string | null
  response_type: string | null
  status_code: number | null
  model: string | null
  multiplier: number | null
  delta: number | null
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

function getSafeMultiplier(multiplier: number): number {
  if (!Number.isFinite(multiplier) || multiplier < 0) {
    return 0
  }

  return multiplier
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

function getSafeStatusCode(statusCode: number | undefined): number | null {
  if (typeof statusCode === "number" && Number.isInteger(statusCode)) {
    return statusCode
  }

  return null
}

function getSafeAccountId(accountId: string | null | undefined): string | null {
  if (typeof accountId === "string" && accountId.length > 0) {
    return accountId
  }

  return null
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

function getSafeUsageLogEndpoint(
  endpoint: string | null | undefined,
): string | null {
  if (typeof endpoint !== "string") {
    return null
  }

  const trimmed = endpoint.trim()
  return trimmed.length > 0 ? trimmed : null
}

function mapUsageLogRow(row: UsageLogRow): UsageLogEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    monthKey: row.month_key,
    source: row.source,
    accountId: row.account_id ?? undefined,
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
      month_key TEXT NOT NULL,
      source TEXT NOT NULL,
      account_id TEXT,
      endpoint TEXT,
      response_type TEXT,
      status_code INTEGER,
      model TEXT,
      multiplier REAL,
      delta REAL,
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

  return usageLogDb
}

function ensureUsageLogColumns(db: Database): void {
  const columns = db.query("PRAGMA table_info(usage_logs)").all() as Array<{
    name: string
  }>
  const columnNames = new Set(columns.map((column) => column.name))

  if (!columnNames.has("endpoint")) {
    db.run("ALTER TABLE usage_logs ADD COLUMN endpoint TEXT;")
  }

  if (!columnNames.has("account_id")) {
    db.run("ALTER TABLE usage_logs ADD COLUMN account_id TEXT;")
  }

  if (!columnNames.has("response_type")) {
    db.run("ALTER TABLE usage_logs ADD COLUMN response_type TEXT;")
  }

  if (!columnNames.has("status_code")) {
    db.run("ALTER TABLE usage_logs ADD COLUMN status_code INTEGER;")
  }

  if (!columnNames.has("model")) {
    db.run("ALTER TABLE usage_logs ADD COLUMN model TEXT;")
  }

  if (!columnNames.has("multiplier")) {
    db.run("ALTER TABLE usage_logs ADD COLUMN multiplier REAL;")
  }

  if (!columnNames.has("delta")) {
    db.run("ALTER TABLE usage_logs ADD COLUMN delta REAL;")
  }
}

function getMonthKey(date: Date): string {
  return date.toISOString().slice(0, 7)
}

export function appendUsageRequestLog(payload: UsageRequestPayload): string {
  const db = getUsageLogDb()
  const now = new Date()
  const createdAt = now.toISOString()
  const monthKey = getMonthKey(now)

  deleteOutdatedMonthLogs(db, monthKey)

  const safeAccountId = getSafeAccountId(payload.accountId)
  const safeMultiplier = getSafeMultiplier(payload.multiplier)
  const safeDelta = getSafeDelta(payload.delta)
  const safeResponseType = getSafeResponseType(payload.responseType)
  const safeStatusCode = getSafeStatusCode(payload.statusCode)

  const logId = crypto.randomUUID()

  db.query(
    `
      INSERT INTO usage_logs (
        id,
        created_at,
        month_key,
        source,
        account_id,
        endpoint,
        response_type,
        status_code,
        model,
        multiplier,
        delta,
        plan,
        premium_used,
        premium_remaining,
        premium_entitlement,
        chat_used,
        completions_used
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    logId,
    createdAt,
    monthKey,
    "request",
    safeAccountId,
    payload.endpoint,
    safeResponseType,
    safeStatusCode,
    payload.model ?? null,
    safeMultiplier,
    safeDelta,
    "unknown",
    0,
    0,
    0,
    0,
    0,
  )

  return logId
}

export function updateRequestUsageLogSummary(
  logId: string,
  payload: UsageSummaryPayload,
): void {
  const db = getUsageLogDb()

  db.query(
    `
      UPDATE usage_logs
      SET
        premium_used = ?,
        premium_remaining = ?,
        premium_entitlement = ?,
        chat_used = ?,
        completions_used = ?
      WHERE id = ? AND source = 'request'
    `,
  ).run(
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
      month_key,
      source,
      account_id,
      endpoint,
      response_type,
      status_code,
      model,
      multiplier,
      delta,
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
    query += " AND (created_at < ? OR (created_at = ? AND id < ?))"
    params.push(safeCursor.createdAt, safeCursor.createdAt, safeCursor.id)
  }

  query += " ORDER BY created_at DESC, id DESC LIMIT ?"
  params.push(safeLimit + 1)

  const rows = db.query(query).all(...params) as Array<UsageLogRow>
  const hasMore = rows.length > safeLimit
  const slicedRows = hasMore ? rows.slice(0, safeLimit) : rows
  const logs = slicedRows.map((row) => mapUsageLogRow(row))

  const lastRow = slicedRows.at(-1)
  const nextCursor =
    hasMore && lastRow ?
      {
        createdAt: lastRow.created_at,
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
