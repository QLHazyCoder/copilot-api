import type { Context, Next } from "hono"

/**
 * Middleware to restrict access to localhost only.
 * Admin panel should only be accessible from 127.0.0.1 or ::1
 */
export async function localOnlyMiddleware(
  c: Context,
  next: Next,
): Promise<Response | undefined> {
  // Get client IP from various sources
  const forwardedFor = c.req.header("x-forwarded-for")
  const realIP = c.req.header("x-real-ip")

  // Determine client IP
  let clientIP = forwardedFor?.split(",")[0]?.trim() ?? realIP ?? ""

  // If no forwarded headers, assume direct connection
  // For local development, host header will contain localhost or 127.0.0.1
  if (!clientIP) {
    const hostHeader = c.req.header("host") ?? ""
    if (
      hostHeader.startsWith("localhost")
      || hostHeader.startsWith("127.0.0.1")
      || hostHeader.startsWith("[::1]")
    ) {
      clientIP = "127.0.0.1"
    }
  }

  // Check if the request is from localhost
  const isLocalhost =
    clientIP === "127.0.0.1"
    || clientIP === "::1"
    || clientIP === "::ffff:127.0.0.1"
    || clientIP === "localhost"
    || clientIP === "" // Empty usually means direct local connection

  if (!isLocalhost) {
    return c.json(
      {
        error: {
          message: "Forbidden: Admin panel is only accessible from localhost",
          type: "forbidden",
        },
      },
      403,
    )
  }

  await next()
  return undefined
}
