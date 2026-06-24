// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// One-time setup for the whole E2E run (main process):
//   1. bring up isolated Postgres + Redis (docker compose, alt ports)
//   2. apply migrations + seed against the E2E database
//   3. start the fixture HTTP server
//   4. start the real API (apps/api/dist/main.js) as a subprocess, wait healthy
// Teardown tears all of that down. The API must be built first (apps/api/dist);
// `make e2e` does that — we fail fast with a clear message if it's missing.

import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { startApp, stopApp } from "./app-process"
import { DATABASE_URL, REDIS_URL, REPO_ROOT } from "./config"
import { closeDb } from "./db"
import { startFixture, stopFixture } from "./fixture-server"
import { compose, run } from "./proc"

function migrateEnv(): NodeJS.ProcessEnv {
  return { ...process.env, DATABASE_PROVIDER: "postgresql", DATABASE_URL, REDIS_URL }
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const dist = resolve(REPO_ROOT, "apps/api/dist/main.js")
  if (!existsSync(dist)) {
    throw new Error(
      `Missing build artifact ${dist}.\nBuild the API first: pnpm build:api (or run \`make e2e\`).`,
    )
  }

  // 1. Infra — clear any stale run, then bring up fresh and wait for health.
  await compose(["down", "-v"]).catch(() => undefined)
  await compose(["up", "-d", "--wait"])

  // 2. Schema + seed against the E2E DB.
  await run("node", ["scripts/set-db-provider.mjs", "postgresql"], { env: migrateEnv() })
  await run("pnpm", ["prisma", "migrate", "deploy"], { env: migrateEnv() })
  await run("pnpm", ["tsx", "prisma/seed.ts"], { env: migrateEnv() })

  // 3 + 4. Fixture server + the API under test.
  await startFixture()
  await startApp()

  return async () => {
    await stopApp().catch(() => undefined)
    await stopFixture().catch(() => undefined)
    await closeDb().catch(() => undefined)
    await compose(["down", "-v"]).catch(() => undefined)
  }
}
