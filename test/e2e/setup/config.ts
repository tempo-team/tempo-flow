// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Deterministic runtime configuration shared by the global setup (main process)
// and the test workers. Everything is derived from fixed defaults (overridable
// via env), so both contexts compute identical URLs without any cross-boundary
// data passing — the app/fixture run on known ports and tests just connect.

import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))

/** Repo root (…/tempo-flow). */
export const REPO_ROOT = resolve(here, "..", "..", "..")
export const E2E_DIR = resolve(here, "..")

/** docker compose project + file for the isolated infra. */
export const COMPOSE_PROJECT = "tempoflow-e2e"
export const COMPOSE_FILE = resolve(E2E_DIR, "docker-compose.e2e.yml")

const PG_PORT = process.env.E2E_PG_PORT ?? "55432"
const REDIS_PORT = process.env.E2E_REDIS_PORT ?? "56379"
const APP_PORT = process.env.E2E_APP_PORT ?? "13700"
const FIXTURE_PORT = process.env.E2E_FIXTURE_PORT ?? "14700"

export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  `postgresql://tempo:tempo@localhost:${PG_PORT}/tempo_flow_e2e?schema=public`
export const REDIS_URL = process.env.E2E_REDIS_URL ?? `redis://localhost:${REDIS_PORT}`

export const APP_PORT_NUM = Number(APP_PORT)
export const FIXTURE_PORT_NUM = Number(FIXTURE_PORT)

/** Base URL of the API under test (the real apps/api/dist/main.js entrypoint). */
export const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${APP_PORT}`
/** Base URL of the local fixture HTTP server tests point nodes at. */
export const FIXTURE_URL = process.env.E2E_FIXTURE_URL ?? `http://127.0.0.1:${FIXTURE_PORT}`

/** Seeded admin credentials (prisma/seed.ts defaults). */
export const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@tempo-flow.local"
export const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin1234"

/** 32-byte key required by the secret/settings encryption. */
export const SETTINGS_ENCRYPTION_KEY =
  process.env.E2E_SETTINGS_ENCRYPTION_KEY ?? "0123456789abcdef0123456789abcdef"

/** Env handed to the api subprocess so it talks to the isolated infra. */
export function appEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_PROVIDER: "postgresql",
    DATABASE_URL,
    REDIS_URL,
    WORKER_ENABLED: "true",
    WORKER_CONCURRENCY: process.env.E2E_WORKER_CONCURRENCY ?? "5",
    JWT_ACCESS_SECRET: "e2e-access-secret",
    JWT_REFRESH_SECRET: "e2e-refresh-secret",
    SETTINGS_ENCRYPTION_KEY,
    SEED_ON_START: "false",
    RUN_MIGRATIONS: "false",
    PORT: APP_PORT,
    PUBLIC_URL: BASE_URL,
    // Tracing off (no OTLP endpoint) to keep the subprocess quiet/fast.
    OTEL_EXPORTER_OTLP_ENDPOINT: "",
  }
}

/** Capability flags — external-dependency suites opt in via env. */
export const CAP = {
  docker: process.env.E2E_DOCKER === "1",
  k8s: process.env.E2E_K8S === "1",
  llm: process.env.E2E_LLM === "1",
  durable: process.env.E2E_DURABLE === "1",
  // Tests gated by the watchdog's fixed 60s stuck-grace (orphaned-run) — too slow
  // for the default suite. Sweep interval is also fixed at 15s.
  slow: process.env.E2E_SLOW === "1",
}
