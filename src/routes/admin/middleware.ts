import type { Context, Next } from "hono"

import {
  getAdminAuthStatus,
  getAdminSessionState,
  isLocalhostRequest,
  isSameOriginAdminRequest,
  isSecureRequest,
  isAdminWriteMethod,
  shouldEnforceAdminHttps,
} from "~/lib/admin-auth"

function getAdminSubPath(c: Context): string {
  return c.req.path.startsWith("/admin") ?
      (c.req.path.slice("/admin".length) || "/")
    : c.req.path
}

function isAdminApiRequest(c: Context): boolean {
  return getAdminSubPath(c).startsWith("/api/")
}

function isPublicRoute(subPath: string): boolean {
  return (
    subPath === "/login"
    || subPath === "/api/session"
    || subPath === "/api/session/login"
  )
}

function createAdminJsonError(
  c: Context,
  status: number,
  message: string,
  type: string,
): Response {
  return c.json(
    {
      error: {
        message,
        type,
      },
    },
    status as 401 | 403 | 428,
  )
}

function createAdminHtmlError(c: Context, status: number, title: string): Response {
  return c.html(
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
      :root {
        --bg: #0b1118;
        --surface: #162231;
        --border: #2a3f56;
        --text: #dbe7f5;
        --muted: #9ab0c8;
        --accent: #25b39e;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(37, 179, 158, 0.16), transparent 32%),
          linear-gradient(160deg, var(--bg), #13202f);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(560px, 100%);
        padding: 28px;
        border: 1px solid var(--border);
        border-radius: 16px;
        background: linear-gradient(180deg, rgba(27, 42, 59, 0.96), rgba(18, 30, 43, 0.96));
      }
      h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }
      p {
        margin: 0;
        line-height: 1.6;
        color: var(--muted);
      }
      a {
        color: var(--accent);
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>Please open the admin panel from a secure and authorized environment.</p>
    </main>
  </body>
</html>`,
    status as 403 | 428,
  )
}

function redirectToAdminPage(
  c: Context,
  targetPath: "/admin" | "/admin/login" | "/admin/setup",
): Response {
  return c.redirect(targetPath, 302)
}

export async function adminAccessMiddleware(
  c: Context,
  next: Next,
): Promise<Response | undefined> {
  const subPath = getAdminSubPath(c)
  const isApiRequest = isAdminApiRequest(c)
  const adminStatus = getAdminAuthStatus()

  if (!adminStatus.configured) {
    if (!isLocalhostRequest(c)) {
      return isApiRequest ?
          createAdminJsonError(
            c,
            403,
            "Forbidden: Admin setup is only accessible from localhost until a management secret is configured",
            "forbidden",
          )
        : createAdminHtmlError(c, 403, "Admin setup is restricted to localhost")
    }

    if (subPath !== "/setup" && subPath !== "/api/setup" && subPath !== "/api/session") {
      return isApiRequest ?
          createAdminJsonError(
            c,
            428,
            "Admin secret is not configured yet. Complete setup first.",
            "setup_required",
          )
        : redirectToAdminPage(c, "/admin/setup")
    }

    await next()
    return undefined
  }

  if (shouldEnforceAdminHttps() && !isLocalhostRequest(c) && !isSecureRequest(c)) {
    return isApiRequest ?
        createAdminJsonError(
          c,
          403,
          "Forbidden: Admin authentication requires HTTPS",
          "https_required",
        )
      : createAdminHtmlError(c, 403, "HTTPS is required for Admin access")
  }

  const sessionState = await getAdminSessionState(c)

  if (isPublicRoute(subPath)) {
    if (sessionState.authenticated && subPath === "/login") {
      return redirectToAdminPage(c, "/admin")
    }

    await next()
    return undefined
  }

  if (!sessionState.authenticated) {
    return isApiRequest ?
        createAdminJsonError(
          c,
          401,
          "Unauthorized: Admin login required",
          "authentication_error",
        )
      : redirectToAdminPage(c, "/admin/login")
  }

  if (isApiRequest && isAdminWriteMethod(c.req.method) && !isSameOriginAdminRequest(c)) {
    return createAdminJsonError(
      c,
      403,
      "Forbidden: Cross-origin admin write request rejected",
      "forbidden",
    )
  }

  await next()
  return undefined
}
