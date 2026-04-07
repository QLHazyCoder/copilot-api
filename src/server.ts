import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"

import { createAuthMiddleware } from "./lib/request-auth"
import { traceIdMiddleware } from "./lib/trace"
import { adminRoutes } from "./routes/admin/route"
import { completionRoutes } from "./routes/chat-completions/route"
import { embeddingRoutes } from "./routes/embeddings/route"
import { geminiRoutes } from "./routes/gemini/route"
import { messageRoutes } from "./routes/messages/route"
import { modelRoutes } from "./routes/models/route"
import { responsesRoutes } from "./routes/responses/route"
import { tokenRoute } from "./routes/token/route"
import { usageRoute } from "./routes/usage/route"

export const server = new Hono()

server.use(traceIdMiddleware)
server.use(logger())
server.use(cors())
server.use(
  "*",
  createAuthMiddleware({
    allowUnauthenticatedPaths: ["/", "/admin"],
    allowUnauthenticatedPathPrefixes: ["/admin/"],
  }),
)

server.get("/", (c) => c.text("Server running"))

server.route("/chat/completions", completionRoutes)
server.route("/models", modelRoutes)
server.route("/embeddings", embeddingRoutes)
server.route("/usage", usageRoute)
server.route("/token", tokenRoute)
server.route("/responses", responsesRoutes)

// Compatibility with tools that expect v1/ prefix
server.route("/v1/chat/completions", completionRoutes)
server.route("/v1/models", modelRoutes)
server.route("/v1/embeddings", embeddingRoutes)
server.route("/v1/responses", responsesRoutes)

// Gemini compatible endpoints
server.route("/v1beta/models", geminiRoutes)

// Anthropic compatible endpoints
server.route("/v1/messages", messageRoutes)

// Admin panel (localhost only)
server.route("/admin", adminRoutes)
