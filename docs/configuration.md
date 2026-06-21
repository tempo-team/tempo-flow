<!--
Copyright 2026 The tempo-flow Authors
SPDX-License-Identifier: Apache-2.0
-->

# Configuration

All configuration is via environment variables (see [`.env.example`](../.env.example)).

## Database

| Var                 | Default      | Notes                                     |
| ------------------- | ------------ | ----------------------------------------- |
| `DATABASE_PROVIDER` | `postgresql` | `postgresql` \| `mysql` \| `sqlite`       |
| `DATABASE_URL`      | —            | Connection string for the chosen provider |

Switching providers rewrites the Prisma datasource via
`scripts/set-db-provider.mjs` (run automatically on `pnpm install` and in the
container entrypoint). Examples:

```bash
# PostgreSQL
DATABASE_PROVIDER=postgresql
DATABASE_URL="postgresql://tempo:tempo@localhost:5432/tempo_flow?schema=public"

# MySQL
DATABASE_PROVIDER=mysql
DATABASE_URL="mysql://tempo:tempo@localhost:3306/tempo_flow"

# SQLite (no external DB)
DATABASE_PROVIDER=sqlite
DATABASE_URL="file:./dev.db"
```

> JSON-shaped columns are stored as strings so the same schema runs on all three
> providers. The committed migration is PostgreSQL-flavored; for MySQL/SQLite use
> `prisma db push` (the entrypoint does this automatically).

## Auth

| Var                   | Default                  | Notes                        |
| --------------------- | ------------------------ | ---------------------------- |
| `JWT_ACCESS_SECRET`   | `change-me-access`       | **Set in production**        |
| `JWT_REFRESH_SECRET`  | `change-me-refresh`      | **Set in production**        |
| `JWT_ACCESS_TTL`      | `900s`                   | Access token lifetime        |
| `JWT_REFRESH_TTL`     | `7d`                     | Refresh token lifetime       |
| `SEED_ADMIN_EMAIL`    | `admin@tempo-flow.local` | Seeded admin                 |
| `SEED_ADMIN_PASSWORD` | `admin1234`              | **Change after first login** |

## Queue / workers

| Var                  | Default                  | Notes                               |
| -------------------- | ------------------------ | ----------------------------------- |
| `REDIS_URL`          | `redis://localhost:6379` | BullMQ + distributed lock           |
| `WORKER_ENABLED`     | `true`                   | Run the in-process flow worker      |
| `WORKER_CONCURRENCY` | `5`                      | Concurrent jobs per worker          |
| `RUN_MIGRATIONS`     | `true`                   | Set `false` on worker-only replicas |

## Notifications

Secrets (Slack webhook URL, Telegram bot token) are encrypted at rest with
AES-256-GCM using `SETTINGS_ENCRYPTION_KEY`. Configure channels in the UI
(Settings → notifications) or via `PUT /api/settings/notifications`.

| Var                       | Default | Notes                               |
| ------------------------- | ------- | ----------------------------------- |
| `SETTINGS_ENCRYPTION_KEY` | dev key | **Set a 32-byte key in production** |

## Kubernetes executor

The K8s executor uses in-cluster config when running inside Kubernetes, else the
local kubeconfig. Per-node settings (`image`, `command`, `args`, `namespace`,
`paramsAs`) live in the flow definition. See
[`test/e2e/k8s/`](../test/e2e/k8s/README.md) for the minikube E2E.
