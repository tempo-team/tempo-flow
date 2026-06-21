<p align="center">
  <img src="./docs/assets/logo.png" alt="tempo-flow" width="120" height="120" />
</p>

# tempo-flow

> Self-hosted batch management for backend teams — flow visualization, second-level cron,
> multi follow-up chaining, and HTTP / Kubernetes executors. 100% TypeScript.

tempo-flow lets you register batch jobs, schedule them with **second-level cron**, chain
**multiple follow-up steps** with success/failure branching, **visualize the flow** as a DAG,
and run each step over **HTTP** or as a **Kubernetes Job (Pod)** — all from a single
self-hosted app you can stand up with `docker compose up`.

## Why tempo-flow

- **TypeScript end to end** — api (NestJS) + web (React) in one monorepo.
- **Second-level cron** — schedule down to the second (6-field cron via Croner).
- **Visual flows** — see and edit batch DAGs in the browser (React Flow).
- **Multi follow-up + conditional branching** — fan out on success/failure.
- **Pluggable executors** — call an HTTP endpoint or spawn a Kubernetes Job.
- **Bring your own DB** — Prisma supports PostgreSQL / MySQL / SQLite with migrations.
- **Distributed & safe** — BullMQ + Redis with distributed locks (no duplicate runs).
- **Notifications** — Slack and Telegram out of the box.
- **RBAC** — admin / operator / viewer roles.

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

## Status

🚧 Early development. See the implementation plan in
[`thoughts/shared/plans/`](./thoughts/shared/plans/).

## License

[Apache 2.0](./LICENSE). Contributions require a lightweight CLA — see
[CONTRIBUTING.md](./CONTRIBUTING.md).
