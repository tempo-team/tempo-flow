// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import "reflect-metadata"
import { ValidationPipe } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { AppModule } from "./app.module"

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
  // All API routes under /api; /health stays at root for container healthchecks.
  app.setGlobalPrefix("api", { exclude: ["health"] })
  const port = Number(process.env.PORT ?? 3000)
  await app.listen(port)
  console.info(`tempo-flow api listening on :${port}`)
}

void bootstrap()
