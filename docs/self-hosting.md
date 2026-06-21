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
