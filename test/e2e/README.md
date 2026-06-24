<!--
Copyright 2026 The tempo-flow Authors
SPDX-License-Identifier: Apache-2.0
-->

# Product integration / E2E suite

Black-box tests that drive the **real API** over HTTP against **real infra**
(Postgres + Redis + BullMQ), asserting through the DB. They cover the full
lifecycle: flow creation → trigger-driven run creation → normal processing →
failure/recovery.

## How it works

The suite runs as a single Vitest process (`test/e2e/vitest.config.ts`). The
global setup (`setup/global-setup.ts`):

1. brings up isolated **Postgres + Redis** via `docker-compose.e2e.yml` on
   alternate ports (55432 / 56379) under project `tempoflow-e2e`;
2. applies migrations (`prisma migrate deploy`) and seeds (`prisma/seed.ts`);
3. starts a local **fixture HTTP server** (`setup/fixture-server.ts`) that flow
   nodes call (`/echo`, `/fail/:code`, `/flaky/:n`, `/slow/:ms`, `/async-callback`);
4. starts the **real API** (`apps/api/dist/main.js`) as a subprocess wired to the
   isolated infra, and waits for `/health`.

Tests are pure HTTP clients (`fetch`) plus a direct Prisma client for DB
assertions/reset. Each test gets a clean DB via `setup/per-test.ts`
(`TRUNCATE` + Redis `flushall` + fixture reset); seed users/roles are preserved.

> The API runs as the actual shipped entrypoint (a subprocess), not bootstrapped
> in-process. This is a faithful black box and lets failure-phase tests simulate
> a worker crash by **really killing and respawning** the process
> (`setup/app-process.ts` `restartApp`).

## Running

```bash
make e2e            # build the API, then run the whole suite (infra up→run→down)

# or manually:
pnpm build:api      # the suite imports the built apps/api/dist/main.js
pnpm test:e2e                       # all non-gated suites
pnpm test:e2e -- smoke              # a single file
pnpm test:e2e:typecheck             # typecheck the e2e sources

# debug infra by hand:
make e2e-up         # bring up just Postgres + Redis
make e2e-down       # tear them down
```

Requires Docker (for the Postgres/Redis containers). The Script executor suite
also needs the host Docker daemon; K8s/Spring Batch need minikube; LLM needs API
keys — these are **opt-in** via capability flags.

## Capability flags (external dependencies)

| Flag            | Enables                                              |
| --------------- | ---------------------------------------------------- |
| `E2E_DOCKER=1`  | Script executor (real one-shot Docker containers)    |
| `E2E_K8S=1`     | K8s + Spring Batch executors (needs minikube)        |
| `E2E_NAMESPACE` | Namespace for K8s Jobs (default `default`)           |
| `E2E_LLM=1`     | LLM executor (needs ANTHROPIC/OPENAI/GEMINI keys)    |
| `E2E_DURABLE=1` | Worker-restart durability tests (kills/respawns app) |

Override ports/creds with `E2E_PG_PORT`, `E2E_REDIS_PORT`, `E2E_APP_PORT`,
`E2E_FIXTURE_PORT` (see `setup/config.ts`).

## Layout

```
test/e2e/
  vitest.config.ts          # single-fork, long timeouts, global setup
  docker-compose.e2e.yml    # isolated Postgres + Redis
  setup/
    config.ts               # deterministic ports/urls/env (shared by setup + tests)
    global-setup.ts         # infra up + migrate + seed + fixture + API subprocess
    per-test.ts             # beforeEach: reset DB/Redis/fixture
    app-process.ts          # start/stop/restart the API subprocess
    fixture-server.ts       # the controllable "outside world" HTTP server
    fixture-client.ts       # read fixture-recorded calls (cross-process)
    db.ts                   # Prisma client + truncation
    reset.ts                # per-test reset
    client.ts               # login + authed HTTP client (+ role users)
    builders.ts             # flow/node/edge builders, createFlow, manualRun
    wait.ts                 # waitFor / waitForRun / waitForTerminal
  smoke.e2e.ts              # harness smoke test
```

## Adding a test

```ts
import { describe, expect, it } from "vitest"
import { createFlow, httpNode, manualRun } from "./setup/builders"
import { waitForRun } from "./setup/wait"

it("runs a flow", async () => {
  const flow = await createFlow({ nodes: [httpNode("a", "/echo")] })
  const runId = await manualRun(flow.id)
  const run = await waitForRun(runId, "SUCCESS")
  expect(run.status).toBe("SUCCESS")
})
```

Keep timing assertions on `waitFor*` (never fixed sleeps). Cron-based tests must
delete their flow via the API in cleanup so the long-lived API process
unregisters the cron job (truncation alone doesn't).

## CI

`.github/workflows/ci.yml` runs three E2E jobs:

- **`e2e`** — core + script (`E2E_DOCKER=1`) on every push/PR. Self-provisions
  Postgres/Redis via docker compose; no `services:` needed.
- **`e2e-k8s`** — K8s + Spring Batch on minikube. Gated: runs on `main` or when a
  PR carries the `e2e-k8s` label.
- **`e2e-llm`** — LLM providers on `main`. Provider tests self-skip when their key
  secret is absent, so the job stays green without keys configured.

The watchdog-bound `orphaned-run` test (`E2E_SLOW`) is not run in CI (≈75s).
