<p align="center">
  <img src="./docs/assets/logo.png" alt="tempo-flow" width="120" height="120" />
</p>

# tempo-flow

> Self-hosted, 100% TypeScript workflow orchestration for backend teams — a
> **durable** execution engine, second-level cron, visual DAGs, and pluggable
> executors (HTTP, Kubernetes, Spring Batch, inline scripts, sub-flows, and
> **LLMs**). Stand it up with `docker compose up`.

tempo-flow registers batch jobs and workflows, schedules them with **second-level
cron** (or manual / webhook / event triggers), chains **multiple follow-up steps**
with success/failure branching, **visualizes the flow** as a DAG, and runs each
step over **HTTP**, as a **Kubernetes Job**, a **Spring Batch job**, an
**isolated inline script**, a **sub-flow**, or an **LLM call** — on a **durable
engine** that checkpoints
progress and resumes across worker restarts.

## Features

**Orchestration & reliability**

- **Durable checkpoint-resume engine** — a run survives worker restarts; long
  external jobs report back via async completion callbacks instead of holding a
  worker ([how jobs report results](./docs/callbacks.md)).
- **Second-level cron** (6-field via Croner) plus manual, webhook, and event
  triggers, and date-range backfill.
- **Multi follow-up + conditional branching** — fan out on success / failure / always.
- **Dynamic fan-out** (`forEach`) with all / any / ratio join policies.
- **Sub-flows** — run a whole flow as a single node.
- **Run-level guardrails** — node-run budget, sub-flow depth, and tool allow-lists.
- **Distributed & safe** — BullMQ + Redis with claim-based concurrency (no duplicate runs).

**Executors**

- **HTTP**, **Kubernetes Job (Pod)**, **Spring Batch (on K8s)**, **inline
  multi-language scripts** (Python / Node / Bash / Go in isolated containers),
  **sub-flow**, and **LLM**.
- **Spring Batch executor** — run a containerized Spring Boot batch app as a K8s
  Job. Node params become Spring Batch JobParameters (passed as `key=value`
  program args); `jobName` and `profiles` are injected as `SPRING_BATCH_JOB_NAME`
  / `SPRING_PROFILES_ACTIVE`. Reuses the Kubernetes executor's cluster plumbing.

**AI & agents**

- **LLM executor** — Claude / OpenAI / Gemini behind one interface; prompt
  templating over upstream outputs and structured (JSON-schema) outputs.
- **Durable agentic tool-use** — the model calls tools that run as sub-flows; the
  loop suspends while tools run and resumes across restarts (no re-billing turns).

**Security & operations**

- **First-class secrets** — AES-256-GCM at rest, injected at run time, masked from records/logs.
- **Approval gates** — human-in-the-loop before sensitive runs.
- **RBAC** (admin / operator / viewer) and **OIDC single sign-on**.
- **OpenTelemetry** tracing — flow/node spans with trace-context propagation.
- **Notifications** — Slack, Telegram, Discord, Email, and webhooks.

**Platform**

- **100% TypeScript** monorepo — NestJS api + React (React Flow) web, dark-first UI.
- **Bring your own DB** — Prisma on PostgreSQL / MySQL / SQLite.
- **One-command self-hosting** — `docker compose up`.

## Quick start (Docker)

```bash
docker compose up --build
# Web UI:     http://localhost:8080
# API health: http://localhost:3000/health
# Login:      admin@tempo-flow.local / admin1234
```

See [docs/self-hosting.md](./docs/self-hosting.md) for scaling workers, switching
databases, and the killer demo. Configuration reference:
[docs/configuration.md](./docs/configuration.md).

## Quick start (dev)

```bash
pnpm install        # installs deps, generates Prisma client, wires git hooks
make build          # build all packages + apps
make check          # typecheck + lint + test

# Set up the database (see "Database & migrations" below):
#   PostgreSQL:      make migrate-dev
#   MySQL / SQLite:  pnpm prisma db push
make seed           # seed default roles + admin

pnpm dev            # run api + web together (watch mode)
pnpm dev:api        # run only the api
pnpm dev:web        # run only the web
```

> The api needs a database + Redis. For a zero-dependency local run, set
> `DATABASE_PROVIDER=sqlite` and `DATABASE_URL="file:./dev.db"` in `.env`
> (copy from [`.env.example`](./.env.example)) and use `pnpm prisma db push` —
> or just run `docker compose up`. See [Database & migrations](#database--migrations).

Architecture overview and extension points (custom executors / notification
channels): [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Database & migrations

tempo-flow uses **Prisma** and runs on **PostgreSQL (default), MySQL, or SQLite**.

### 1. Configure the provider

Copy `.env.example` to `.env` and set two variables:

```bash
# PostgreSQL (default)
DATABASE_PROVIDER=postgresql
DATABASE_URL="postgresql://tempo:tempo@localhost:5432/tempo_flow?schema=public"

# MySQL
DATABASE_PROVIDER=mysql
DATABASE_URL="mysql://tempo:tempo@localhost:3306/tempo_flow"

# SQLite — no external server needed (great for a quick local try)
DATABASE_PROVIDER=sqlite
DATABASE_URL="file:./dev.db"
```

Prisma can't read the datasource `provider` from an env var, so
[`scripts/set-db-provider.mjs`](./scripts/set-db-provider.mjs) rewrites the
`provider` line in [`prisma/schema.prisma`](./prisma/schema.prisma) to match
`DATABASE_PROVIDER`. It runs automatically on `pnpm install` (postinstall) and in
the container entrypoint, or manually via `pnpm db:provider` / `make db-provider`.

> Portability note: JSON-shaped columns are stored as `String` and `enum`s as
> plain strings, so the **same schema** runs on all three providers (SQLite has
> no native `Json`/`enum`). (De)serialize via `toJson` / `fromJson` from
> `@tempo-flow/shared-types`.

### 2. Apply the schema

| Task                               | Command                | Notes                                                                 |
| ---------------------------------- | ---------------------- | --------------------------------------------------------------------- |
| Generate Prisma client             | `make prisma-generate` | also runs on `pnpm install`                                           |
| Validate schema                    | `make prisma-validate` | no DB needed                                                          |
| Create + apply a dev migration     | `make migrate-dev`     | **PostgreSQL only** — creates a new migration in `prisma/migrations/` |
| Apply committed migrations         | `make migrate`         | runs `prisma migrate deploy` (production / CI)                        |
| Push schema without a migration    | `pnpm prisma db push`  | for MySQL / SQLite (see caveat)                                       |
| Reset DB (drop + re-create + seed) | `make db-reset`        | destructive                                                           |

#### PostgreSQL (committed migration history)

The repo ships a committed migration at
[`prisma/migrations/0_init/`](./prisma/migrations/) generated **for PostgreSQL**
(`migration_lock.toml` is pinned to `postgresql`). On Postgres:

```bash
make migrate     # prisma migrate deploy — applies 0_init (and any later migrations)
make seed        # default roles/permissions + admin user
```

#### MySQL / SQLite (use `db push`)

Because the committed migration is Postgres-flavored, `prisma migrate deploy`
fails on a different provider:

```
Error: P3019 — The datasource provider `sqlite` ... does not match ...
`postgresql` in the migration_lock.toml.
```

For MySQL/SQLite, apply the schema directly with `db push` (no migration files):

```bash
DATABASE_PROVIDER=sqlite DATABASE_URL="file:./dev.db" \
  pnpm prisma db push        # creates tables from schema.prisma
make seed
```

The Docker entrypoint does this automatically: `migrate deploy` for PostgreSQL,
`db push` for MySQL/SQLite. CI ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml))
runs both paths across a `postgres` / `mysql` / `sqlite` matrix.

### 3. Seed data

`make seed` (or `pnpm tsx prisma/seed.ts`) is **idempotent** (upserts) and creates:

- Permissions (`action:resource`) and the `admin` / `operator` / `viewer` roles
- A default admin user — override with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`

In containers, set `SEED_ON_START=true` to seed on first boot (the default
`docker-compose.yml` enables it for the `api` service). **Change the seeded admin
password after first login.**

### 4. Production / containers

The api/worker entrypoint ([`docker/entrypoint.sh`](./docker/entrypoint.sh)):

1. sets the provider from `DATABASE_PROVIDER`,
2. applies the schema (`migrate deploy` on Postgres, else `db push`) when
   `RUN_MIGRATIONS=true` (set `false` on worker replicas so only the primary
   migrates),
3. optionally seeds (`SEED_ON_START`), then starts the API.

See [docs/configuration.md](./docs/configuration.md) for the full env reference.

## License

[Apache 2.0](./LICENSE). Contributions require a lightweight CLA — see
[CONTRIBUTING.md](./CONTRIBUTING.md).
