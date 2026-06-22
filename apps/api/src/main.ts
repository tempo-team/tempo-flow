// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import "reflect-metadata"
import { ValidationPipe } from "@nestjs/common"
import { createBullBoard } from "@bull-board/api"
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter"
import { ExpressAdapter } from "@bull-board/express"
import { NestFactory } from "@nestjs/core"
import type { NextFunction, Request, Response } from "express"
import { AppModule } from "./app.module"
import { QueueService } from "./queue/queue.service"

/** Minimal HTTP Basic auth for the Bull-Board dashboard. */
function bullBoardAuth(req: Request, res: Response, next: NextFunction): void {
  const user = process.env.BULLBOARD_USER ?? "admin"
  const pass = process.env.BULLBOARD_PASS ?? process.env.SEED_ADMIN_PASSWORD ?? "admin1234"
  const header = req.headers.authorization ?? ""
  const [, encoded] = header.split(" ")
  const decoded = encoded ? Buffer.from(encoded, "base64").toString() : ""
  if (decoded === `${user}:${pass}`) return next()
  res.setHeader("WWW-Authenticate", 'Basic realm="tempo-flow"')
  res.status(401).send("Authentication required")
}

/**
 * Refuse to boot in production with unset or default-valued secrets — these
 * dev defaults would otherwise allow JWT forgery / secret decryption.
 */
function assertProductionSecrets(): void {
  if (process.env.NODE_ENV !== "production") return
  const insecure: Record<string, string | undefined> = {
    JWT_ACCESS_SECRET: "change-me-access",
    JWT_REFRESH_SECRET: "change-me-refresh",
    SETTINGS_ENCRYPTION_KEY: undefined,
  }
  const bad = Object.entries(insecure)
    .filter(([key, dev]) => {
      const value = process.env[key]
      return !value || (dev !== undefined && value === dev)
    })
    .map(([key]) => key)
  if (bad.length > 0) {
    throw new Error(
      `Refusing to start: set strong values for ${bad.join(", ")} in production (not the dev defaults).`,
    )
  }
}

async function bootstrap(): Promise<void> {
  assertProductionSecrets()
  // rawBody is kept so webhook HMAC signatures can be verified over exact bytes.
  const app = await NestFactory.create(AppModule, { rawBody: true })
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  // Restrict origins in production via CORS_ORIGIN (comma-separated); defaults to
  // reflecting any origin for local dev.
  const corsOrigin = process.env.CORS_ORIGIN
  app.enableCors({ origin: corsOrigin ? corsOrigin.split(",").map((o) => o.trim()) : true })
  // All API routes under /api; /health + /metrics stay at root for probes/scrapers.
  app.setGlobalPrefix("api", { exclude: ["health", "metrics"] })

  // Bull-Board queue dashboard at /admin/queues (HTTP Basic auth).
  const serverAdapter = new ExpressAdapter()
  serverAdapter.setBasePath("/admin/queues")
  createBullBoard({
    queues: [new BullMQAdapter(app.get(QueueService).getQueue())],
    serverAdapter,
  })
  app.use("/admin/queues", bullBoardAuth, serverAdapter.getRouter())

  const port = Number(process.env.PORT ?? 3000)
  await app.listen(port)
  console.info(`tempo-flow api listening on :${port}`)
}

void bootstrap()
