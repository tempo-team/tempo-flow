<!--
Copyright 2026 The tempo-flow Authors
SPDX-License-Identifier: Apache-2.0
-->

# Self-hosting tempo-flow

Get a full stack (API + worker + web UI + Postgres + Redis) running in ~5 minutes.

## Prerequisites

- Docker + Docker Compose

## Quick start

```bash
git clone <your-fork-or-this-repo> tempo-flow
cd tempo-flow

# (optional) set strong secrets — defaults are fine for a local trial
export JWT_ACCESS_SECRET=$(openssl rand -hex 32)
export JWT_REFRESH_SECRET=$(openssl rand -hex 32)
export SETTINGS_ENCRYPTION_KEY=$(openssl rand -hex 16)

docker compose up --build
```

This will:

1. Start Postgres and Redis (with healthchecks).
2. Build and start the **api** (which applies Prisma migrations and seeds a
   default admin on first boot), a **worker** replica, and the **web** UI.

Then open:

- Web UI: <http://localhost:8080>
- API health: <http://localhost:3000/health>

Log in with the seeded admin:

- Email: `admin@tempo-flow.local` (override with `SEED_ADMIN_EMAIL`)
- Password: `admin1234` (override with `SEED_ADMIN_PASSWORD`)

## Scaling workers

Workers consume the BullMQ `flow-run` queue. Run more replicas:

```bash
docker compose up --scale worker=3
```

The Redis tick-lock + BullMQ job dedup ensure each scheduled run executes once,
even with many workers.

## High availability & multi-node

tempo-flow is safe to run as **multiple API and worker instances** behind a load
balancer. Every instance is stateless — all run state lives in the database, and
all cross-instance coordination goes through Redis. You can scale each tier
independently:

```bash
# e.g. 2 API replicas + 4 worker replicas, one shared Postgres, one shared Redis
docker compose up --scale api=2 --scale worker=4
```

How duplicate work is prevented across instances:

- **Cron never double-fires.** Each instance runs its own in-memory cron timer,
  but every tick must first acquire a per-`(flow, second)` Redis lock
  (`SET NX PX`); only one instance wins and creates the run.
- **Steps never run twice.** Runs are enqueued with `jobId = runId` (BullMQ
  dedup), and each node claim is guarded by a DB unique key
  `(flowRunId, nodeId, mapIndex)` — a concurrent claim simply loses the race.
- **State survives restarts.** Run/node state is reloaded from the database on
  every advance, so a crashed or rescheduled instance loses no progress; another
  worker picks the run up.
- **Orphan/SLA cleanup is race-safe.** The watchdog uses conditional
  `updateMany(where status=Running)`, so only one instance can transition a given
  run.

### Make the shared infrastructure HA

Coordination correctness depends on the **shared** Postgres and Redis. In a
single-node trial they're fine as-is, but a true multi-node production deployment
should remove these single points of failure:

- **Redis** — all locks, the BullMQ queue, and event-trigger streams depend on
  it. Use **Redis Sentinel** (or a managed/clustered Redis) for failover, and
  point `REDIS_URL` at the Sentinel/managed endpoint. Requires Redis 6.2+
  (Streams).
- **Database** — use a replicated/managed Postgres (or MySQL). All instances
  share one logical database; run Prisma migrations once per deploy.
- **Stateless app tier** — API and worker containers hold no durable state, so
  put the API behind any load balancer and scale workers to match queue depth.

> All instances are configured purely from env vars — no per-instance config
> files — so horizontal scaling needs no extra wiring beyond shared
> `DATABASE_URL` and `REDIS_URL`.

## Switching the database

tempo-flow runs on PostgreSQL (default), MySQL, or SQLite. See
[configuration.md](./configuration.md#database) for the env switches.

## Killer demo

1. Create a flow with a **second-level cron** trigger (`*/5 * * * * *`).
2. Add an HTTP node (or a K8s node) with reservation-date params
   (`${RUN_DATE-1d}` → `yyyyMMdd`).
3. Chain a follow-up node on `success`, and a recovery node on `failure`.
4. Configure Slack/Telegram under Settings → notifications.
5. Watch runs stream into the dashboard; failures ping your channel.
