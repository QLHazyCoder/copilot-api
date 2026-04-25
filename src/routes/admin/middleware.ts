import type { Context, Next } from "hono"

import {
  getAdminAuthStatus,
  getAdminSessionState,
  isAdminWriteMethod,
  isLocalhostRequest,
  isSameOriginAdminRequest,
  isSecureRequest,
  shouldEnforceAdminHttps,
} from "~/lib/admin-auth"

interface AdminJsonErrorOptions {
  message: string
  status: 401 | 403 | 428
  type: string
}

interface AdminRequestContext {
  isApiRequest: boolean
  subPath: string
}

function getAdminSubPath(c: Context): string {
  if (!c.req.path.startsWith("/admin")) {
    return c.req.path
  }

  return c.req.path.slice("/admin".length) || "/"
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
  options: AdminJsonErrorOptions,
): Response {
  return c.json(
    {
      error: {
        message: options.message,
        type: options.type,
      },
    },
    options.status,
  )
}

function createAdminHtmlError(
  c: Context,
  status: number,
  title: string,
): Response {
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

interface AdminErrorResponseOptions {
  htmlTitle: string
  jsonError: AdminJsonErrorOptions
  redirectPath?: "/admin" | "/admin/login" | "/admin/setup"
}

function respondAdminError(
  c: Context,
  requestContext: AdminRequestContext,
  options: AdminErrorResponseOptions,
): Response {
  if (requestContext.isApiRequest) {
    return createAdminJsonError(c, options.jsonError)
  }

  if (options.redirectPath) {
    return redirectToAdminPage(c, options.redirectPath)
  }

  return createAdminHtmlError(c, options.jsonError.status, options.htmlTitle)
}

function handleUnconfiguredAdminAccess(
  c: Context,
  requestContext: AdminRequestContext,
): Response | null {
  if (!isLocalhostRequest(c)) {
    return respondAdminError(c, requestContext, {
      htmlTitle: "Admin setup is restricted to localhost",
      jsonError: {
        message:
          "Forbidden: Admin setup is only accessible from localhost until a management secret is configured",
        status: 403,
        type: "forbidden",
      },
    })
  }

  const canAccessSetupRoute =
    requestContext.subPath === "/setup"
    || requestContext.subPath === "/api/setup"
    || requestContext.subPath === "/api/session"

  if (canAccessSetupRoute) {
    return null
  }

  return respondAdminError(c, requestContext, {
    htmlTitle: "Admin setup is required",
    jsonError: {
      message: "Admin secret is not configured yet. Complete setup first.",
      status: 428,
      type: "setup_required",
    },
    redirectPath: "/admin/setup",
  })
}

function handleHttpsRequirement(
  c: Context,
  requestContext: AdminRequestContext,
): Response | null {
  if (
    !shouldEnforceAdminHttps()
    || isLocalhostRequest(c)
    || isSecureRequest(c)
  ) {
    return null
  }

  return respondAdminError(c, requestContext, {
    htmlTitle: "HTTPS is required for Admin access",
    jsonError: {
      message: "Forbidden: Admin authentication requires HTTPS",
      status: 403,
      type: "https_required",
    },
  })
}

function handlePublicRouteAccess(
  c: Context,
  requestContext: AdminRequestContext,
  authenticated: boolean,
): Response | null {
  if (!isPublicRoute(requestContext.subPath)) {
    return null
  }

  if (authenticated && requestContext.subPath === "/login") {
    return redirectToAdminPage(c, "/admin")
  }

  return null
}

function handleAuthenticationRequirement(
  c: Context,
  requestContext: AdminRequestContext,
  authenticated: boolean,
): Response | null {
  if (authenticated || isPublicRoute(requestContext.subPath)) {
    return null
  }

  return respondAdminError(c, requestContext, {
    htmlTitle: "Admin login required",
    jsonError: {
      message: "Unauthorized: Admin login required",
      status: 401,
      type: "authentication_error",
    },
    redirectPath: "/admin/login",
  })
}

function handleSameOriginRequirement(
  c: Context,
  requestContext: AdminRequestContext,
): Response | null {
  if (
    !requestContext.isApiRequest
    || !isAdminWriteMethod(c.req.method)
    || isSameOriginAdminRequest(c)
  ) {
    return null
  }

  return createAdminJsonError(c, {
    message: "Forbidden: Cross-origin admin write request rejected",
    status: 403,
    type: "forbidden",
  })
}

export async function adminAccessMiddleware(
  c: Context,
  next: Next,
): Promise<Response | undefined> {
  const requestContext: AdminRequestContext = {
    isApiRequest: isAdminApiRequest(c),
    subPath: getAdminSubPath(c),
  }
  const adminStatus = getAdminAuthStatus()

  if (!adminStatus.configured) {
    const response = handleUnconfiguredAdminAccess(c, requestContext)
    if (response) {
      return response
    }

    await next()
    return undefined
  }

  const httpsResponse = handleHttpsRequirement(c, requestContext)
  if (httpsResponse) {
    return httpsResponse
  }

  const sessionState = await getAdminSessionState(c)

  const publicRouteResponse = handlePublicRouteAccess(
    c,
    requestContext,
    sessionState.authenticated,
  )
  if (publicRouteResponse) {
    return publicRouteResponse
  }

  if (isPublicRoute(requestContext.subPath)) {
    await next()
    return undefined
  }

  const authResponse = handleAuthenticationRequirement(
    c,
    requestContext,
    sessionState.authenticated,
  )
  if (authResponse) {
    return authResponse
  }

  const sameOriginResponse = handleSameOriginRequirement(c, requestContext)
  if (sameOriginResponse) {
    return sameOriginResponse
  }

  await next()
  return undefined
}
