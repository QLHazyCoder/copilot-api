import type { Context } from "hono"

import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie"
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto"
import { promisify } from "node:util"

import { getConfig, updateConfig, type ReadonlyAppConfig } from "./config"

const scrypt = promisify(scryptCallback)

const HASH_PREFIX = "scrypt"
const SCRYPT_KEY_LENGTH = 64
const DEFAULT_ADMIN_SESSION_TTL_DAYS = 5
const DEFAULT_ADMIN_HTTPS_ENFORCED = true
const MIN_ADMIN_SECRET_LENGTH = 8
const LOGIN_WINDOW_MS = 10 * 60 * 1000
const MAX_LOGIN_ATTEMPTS = 5
const ADMIN_SESSION_COOKIE_NAME = "copilot_admin_session"
const ADMIN_SESSION_VERSION = 1
const LOCALHOST_HOSTS = new Set([
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
  "localhost",
])

type AdminSecretSource = "none" | "env-hash" | "env-secret" | "config-hash"

type ResolvedAdminSecret =
  | {
      configured: false
      source: "none"
      value?: undefined
      isWritableInApp: true
    }
  | {
      configured: true
      source: Exclude<AdminSecretSource, "none">
      value: string
      isWritableInApp: boolean
    }

export interface AdminSessionPayload {
  exp: number
  iat: number
  sid: string
  v: number
}

export interface AdminSessionState {
  authenticated: boolean
  expiresAt: string | null
  payload: AdminSessionPayload | null
}

export interface AdminAuthStatus {
  configured: boolean
  authenticated: boolean
  requiresSetup: boolean
  sessionTtlDays: number
  enforceHttps: boolean
  secretSource: AdminSecretSource
  secretManagedInApp: boolean
  expiresAt: string | null
}

interface LoginAttemptState {
  count: number
  firstFailedAt: number
}

const loginAttemptsByIp = new Map<string, LoginAttemptState>()
const revokedAdminSessions = new Map<string, number>()

function normalizeSecretValue(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized || undefined
}

function getResolvedAdminSecret(
  config: ReadonlyAppConfig = getConfig(),
): ResolvedAdminSecret {
  const envHash = normalizeSecretValue(process.env.ADMIN_SECRET_HASH)
  if (envHash) {
    return {
      configured: true,
      source: "env-hash",
      value: envHash,
      isWritableInApp: false,
    }
  }

  const envSecret = normalizeSecretValue(process.env.ADMIN_SECRET)
  if (envSecret) {
    return {
      configured: true,
      source: "env-secret",
      value: envSecret,
      isWritableInApp: false,
    }
  }

  const configHash = normalizeSecretValue(config.adminAuth?.secretHash)
  if (configHash) {
    return {
      configured: true,
      source: "config-hash",
      value: configHash,
      isWritableInApp: true,
    }
  }

  return {
    configured: false,
    source: "none",
    isWritableInApp: true,
  }
}

export function getAdminSessionTtlDays(
  config: ReadonlyAppConfig = getConfig(),
): number {
  const sessionTtlDays = config.adminAuth?.sessionTtlDays
  if (
    typeof sessionTtlDays === "number"
    && Number.isFinite(sessionTtlDays)
    && sessionTtlDays > 0
    && Number.isInteger(sessionTtlDays)
  ) {
    return sessionTtlDays
  }

  return DEFAULT_ADMIN_SESSION_TTL_DAYS
}

export function shouldEnforceAdminHttps(
  config: ReadonlyAppConfig = getConfig(),
): boolean {
  if (typeof config.adminAuth?.enforceHttps === "boolean") {
    return config.adminAuth.enforceHttps
  }

  return DEFAULT_ADMIN_HTTPS_ENFORCED
}

export function getAdminAuthStatus(
  sessionState: AdminSessionState | null = null,
  config: ReadonlyAppConfig = getConfig(),
): AdminAuthStatus {
  const resolvedSecret = getResolvedAdminSecret(config)

  return {
    configured: resolvedSecret.configured,
    authenticated: sessionState?.authenticated ?? false,
    requiresSetup: !resolvedSecret.configured,
    sessionTtlDays: getAdminSessionTtlDays(config),
    enforceHttps: shouldEnforceAdminHttps(config),
    secretSource: resolvedSecret.source,
    secretManagedInApp: resolvedSecret.isWritableInApp,
    expiresAt: sessionState?.expiresAt ?? null,
  }
}

function getAdminSessionSigningSecret(
  config: ReadonlyAppConfig = getConfig(),
): string | null {
  const resolvedSecret = getResolvedAdminSecret(config)
  if (!resolvedSecret.configured) {
    return null
  }

  return createHash("sha256")
    .update(
      `copilot-api:admin-session:${resolvedSecret.source}:${resolvedSecret.value}`,
      "utf8",
    )
    .digest("hex")
}

function encodeAdminSessionPayload(payload: AdminSessionPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
}

function decodeAdminSessionPayload(value: string): AdminSessionPayload | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<AdminSessionPayload>

    if (
      parsed.v !== ADMIN_SESSION_VERSION
      || typeof parsed.iat !== "number"
      || typeof parsed.exp !== "number"
      || typeof parsed.sid !== "string"
      || parsed.sid.trim().length === 0
    ) {
      return null
    }

    return {
      v: parsed.v,
      iat: parsed.iat,
      exp: parsed.exp,
      sid: parsed.sid,
    }
  } catch {
    return null
  }
}

function cleanupExpiredRevokedAdminSessions(nowSeconds: number): void {
  for (const [sessionId, expiresAtSeconds] of revokedAdminSessions.entries()) {
    if (expiresAtSeconds <= nowSeconds) {
      revokedAdminSessions.delete(sessionId)
    }
  }
}

function buildSessionCookieOptions(
  c: Context,
  maxAgeSeconds: number,
): {
  httpOnly: true
  maxAge: number
  path: "/admin"
  sameSite: "Strict"
  secure: boolean
} {
  return {
    httpOnly: true,
    maxAge: maxAgeSeconds,
    path: "/admin",
    sameSite: "Strict",
    secure: isSecureRequest(c) || !isLocalhostRequest(c),
  }
}

function getRequestHostname(c: Context): string {
  try {
    return new URL(c.req.url).hostname
  } catch {
    return ""
  }
}

function normalizeHost(value: string): string {
  return value.replace(/^\[/, "").replace(/\]$/, "").split(":")[0] || ""
}

function getForwardedHost(c: Context): string {
  return c.req.header("x-forwarded-host")?.split(",")[0]?.trim() || ""
}

function getClientIp(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
    || c.req.header("x-real-ip")?.trim()
    || ""
  )
}

function hasLocalhostHostHeader(hostHeader: string): boolean {
  return (
    hostHeader.startsWith("localhost")
    || hostHeader.startsWith("127.0.0.1")
    || hostHeader.startsWith("[::1]")
  )
}

function isLoopbackHost(value: string): boolean {
  return LOCALHOST_HOSTS.has(value)
}

export function isLocalhostRequest(c: Context): boolean {
  const hostHeader = c.req.header("host") ?? ""
  const requestHostname = getRequestHostname(c)
  const clientIp = getClientIp(c)
  const hostCandidate = normalizeHost(
    getForwardedHost(c) || hostHeader || requestHostname,
  )

  return (
    isLoopbackHost(clientIp)
    || isLoopbackHost(requestHostname)
    || isLoopbackHost(hostCandidate)
    || (!clientIp
      && (hasLocalhostHostHeader(hostHeader)
        || requestHostname === "localhost"))
  )
}

export function isSecureRequest(c: Context): boolean {
  const forwardedProto = c.req.header("x-forwarded-proto")
  if (forwardedProto) {
    return forwardedProto.split(",")[0]?.trim().toLowerCase() === "https"
  }

  try {
    return new URL(c.req.url).protocol === "https:"
  } catch {
    return false
  }
}

function getExpectedRequestOrigin(c: Context): string | null {
  const host = getForwardedHost(c) || c.req.header("host")?.trim()
  if (!host) {
    return null
  }

  const protocol = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim()
  const normalizedProtocol = protocol || (isSecureRequest(c) ? "https" : "http")

  return `${normalizedProtocol}://${host}`
}

export function isAdminWriteMethod(method: string): boolean {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS"
}

export function isSameOriginAdminRequest(c: Context): boolean {
  if (!isAdminWriteMethod(c.req.method) || isLocalhostRequest(c)) {
    return true
  }

  const expectedOrigin = getExpectedRequestOrigin(c)
  if (!expectedOrigin) {
    return true
  }

  const origin = c.req.header("origin")?.trim()
  if (origin) {
    return origin === expectedOrigin
  }

  const referer = c.req.header("referer")?.trim()
  if (!referer) {
    return true
  }

  try {
    return new URL(referer).origin === expectedOrigin
  } catch {
    return false
  }
}

function getClientIdentifier(c: Context): string {
  const forwardedFor = c.req.header("x-forwarded-for")
  const realIp = c.req.header("x-real-ip")
  const hostHeader = c.req.header("host") ?? "unknown-host"

  const clientIp =
    forwardedFor?.split(",")[0]?.trim() ?? realIp?.trim() ?? hostHeader

  return clientIp || hostHeader
}

function cleanupExpiredLoginAttempts(now: number): void {
  for (const [clientId, state] of loginAttemptsByIp.entries()) {
    if (now - state.firstFailedAt >= LOGIN_WINDOW_MS) {
      loginAttemptsByIp.delete(clientId)
    }
  }
}

export function checkAdminLoginRateLimit(c: Context): {
  limited: boolean
  retryAfterSeconds: number
} {
  const now = Date.now()
  cleanupExpiredLoginAttempts(now)

  const clientId = getClientIdentifier(c)
  const state = loginAttemptsByIp.get(clientId)
  if (!state) {
    return {
      limited: false,
      retryAfterSeconds: 0,
    }
  }

  if (state.count < MAX_LOGIN_ATTEMPTS) {
    return {
      limited: false,
      retryAfterSeconds: 0,
    }
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((LOGIN_WINDOW_MS - (now - state.firstFailedAt)) / 1000),
  )

  return {
    limited: retryAfterSeconds > 0,
    retryAfterSeconds,
  }
}

export function recordAdminLoginFailure(c: Context): void {
  const now = Date.now()
  cleanupExpiredLoginAttempts(now)

  const clientId = getClientIdentifier(c)
  const existing = loginAttemptsByIp.get(clientId)
  if (!existing) {
    loginAttemptsByIp.set(clientId, {
      count: 1,
      firstFailedAt: now,
    })
    return
  }

  if (now - existing.firstFailedAt >= LOGIN_WINDOW_MS) {
    loginAttemptsByIp.set(clientId, {
      count: 1,
      firstFailedAt: now,
    })
    return
  }

  existing.count += 1
}

export function clearAdminLoginFailures(c: Context): void {
  loginAttemptsByIp.delete(getClientIdentifier(c))
}

function normalizeAdminSecretInput(secret: string): string {
  return secret.trim()
}

export function validateAdminSecret(secret: string): {
  valid: boolean
  normalizedSecret: string
  message?: string
} {
  const normalizedSecret = normalizeAdminSecretInput(secret)

  if (!normalizedSecret) {
    return {
      valid: false,
      normalizedSecret,
      message: "Admin secret is required",
    }
  }

  if (normalizedSecret.length < MIN_ADMIN_SECRET_LENGTH) {
    return {
      valid: false,
      normalizedSecret,
      message: `Admin secret must be at least ${MIN_ADMIN_SECRET_LENGTH} characters`,
    }
  }

  return {
    valid: true,
    normalizedSecret,
  }
}

function stableStringDigest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest()
}

function isSamePlainSecret(left: string, right: string): boolean {
  return timingSafeEqual(stableStringDigest(left), stableStringDigest(right))
}

export async function hashAdminSecret(secret: string): Promise<string> {
  const normalizedSecret = normalizeAdminSecretInput(secret)
  const salt = randomBytes(16).toString("base64url")
  const derivedKey = (await scrypt(
    normalizedSecret,
    salt,
    SCRYPT_KEY_LENGTH,
  )) as Buffer

  return `${HASH_PREFIX}$${salt}$${Buffer.from(derivedKey).toString("base64url")}`
}

export async function verifyAdminSecret(secret: string): Promise<boolean> {
  const resolvedSecret = getResolvedAdminSecret()
  if (!resolvedSecret.configured) {
    return false
  }

  const normalizedSecret = normalizeAdminSecretInput(secret)
  if (!normalizedSecret) {
    return false
  }

  if (resolvedSecret.source === "env-secret") {
    return isSamePlainSecret(normalizedSecret, resolvedSecret.value)
  }

  return await verifyAdminSecretHash(normalizedSecret, resolvedSecret.value)
}

export async function verifyAdminSecretHash(
  secret: string,
  storedHash: string,
): Promise<boolean> {
  const [prefix, salt, encodedHash] = storedHash.split("$")
  if (prefix !== HASH_PREFIX || !salt || !encodedHash) {
    return false
  }

  try {
    const expectedHash = Buffer.from(encodedHash, "base64url")
    const derivedKey = (await scrypt(
      secret,
      salt,
      expectedHash.length,
    )) as Buffer
    if (derivedKey.length !== expectedHash.length) {
      return false
    }

    return timingSafeEqual(derivedKey, expectedHash)
  } catch {
    return false
  }
}

export async function saveAdminSecret(secret: string): Promise<void> {
  const validation = validateAdminSecret(secret)
  if (!validation.valid) {
    throw new Error(validation.message ?? "Invalid admin secret")
  }

  const nextSecretHash = await hashAdminSecret(validation.normalizedSecret)
  await updateConfig((config) => ({
    ...config,
    adminAuth: {
      ...config.adminAuth,
      secretHash: nextSecretHash,
      sessionTtlDays: getAdminSessionTtlDays(config),
      enforceHttps: shouldEnforceAdminHttps(config),
    },
  }))
}

export function canManageAdminSecretInApp(
  config: ReadonlyAppConfig = getConfig(),
): boolean {
  return getResolvedAdminSecret(config).isWritableInApp
}

export async function createAdminSession(
  c: Context,
): Promise<AdminSessionPayload | null> {
  const signingSecret = getAdminSessionSigningSecret()
  if (!signingSecret) {
    return null
  }

  const sessionTtlDays = getAdminSessionTtlDays()
  const now = Math.floor(Date.now() / 1000)
  const maxAgeSeconds = sessionTtlDays * 24 * 60 * 60
  const payload: AdminSessionPayload = {
    v: ADMIN_SESSION_VERSION,
    iat: now,
    exp: now + maxAgeSeconds,
    sid: randomBytes(16).toString("hex"),
  }

  await setSignedCookie(
    c,
    ADMIN_SESSION_COOKIE_NAME,
    encodeAdminSessionPayload(payload),
    signingSecret,
    buildSessionCookieOptions(c, maxAgeSeconds),
  )

  return payload
}

export function clearAdminSession(c: Context): void {
  deleteCookie(c, ADMIN_SESSION_COOKIE_NAME, {
    httpOnly: true,
    path: "/admin",
    sameSite: "Strict",
    secure: isSecureRequest(c) || !isLocalhostRequest(c),
  })
}

export async function getAdminSessionState(
  c: Context,
): Promise<AdminSessionState> {
  const signingSecret = getAdminSessionSigningSecret()
  if (!signingSecret) {
    return {
      authenticated: false,
      expiresAt: null,
      payload: null,
    }
  }

  const rawCookie = await getSignedCookie(
    c,
    signingSecret,
    ADMIN_SESSION_COOKIE_NAME,
  )
  if (typeof rawCookie !== "string" || rawCookie.length === 0) {
    return {
      authenticated: false,
      expiresAt: null,
      payload: null,
    }
  }

  const payload = decodeAdminSessionPayload(rawCookie)
  if (!payload) {
    clearAdminSession(c)
    return {
      authenticated: false,
      expiresAt: null,
      payload: null,
    }
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  cleanupExpiredRevokedAdminSessions(nowSeconds)
  if (revokedAdminSessions.has(payload.sid)) {
    clearAdminSession(c)
    return {
      authenticated: false,
      expiresAt: null,
      payload: null,
    }
  }

  if (payload.exp <= nowSeconds) {
    clearAdminSession(c)
    return {
      authenticated: false,
      expiresAt: null,
      payload: null,
    }
  }

  return {
    authenticated: true,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    payload,
  }
}

export function revokeAdminSession(payload: AdminSessionPayload | null): void {
  if (!payload) {
    return
  }

  cleanupExpiredRevokedAdminSessions(Math.floor(Date.now() / 1000))
  revokedAdminSessions.set(payload.sid, payload.exp)
}

export function resetAdminAuthRuntimeState(): void {
  loginAttemptsByIp.clear()
  revokedAdminSessions.clear()
}
