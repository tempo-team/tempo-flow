.PHONY: install build typecheck lint test format check dev dev-api dev-web clean \
	db-provider prisma-generate prisma-validate migrate migrate-dev seed db-reset \
	e2e e2e-up e2e-down e2e-k8s

install:
	pnpm install

build:
	pnpm run build

typecheck:
	pnpm run typecheck

lint:
	pnpm run lint

test:
	pnpm run test

format:
	pnpm run format

check: typecheck lint test

dev:
	pnpm run dev

dev-api:
	pnpm run dev:api

dev-web:
	pnpm run dev:web

clean:
	pnpm -r exec rm -rf dist .turbo
	rm -rf node_modules

# --- Database -------------------------------------------------------------
# Set the datasource provider from DATABASE_PROVIDER (default postgresql).
db-provider:
	node scripts/set-db-provider.mjs

prisma-generate: db-provider
	pnpm prisma generate

prisma-validate: db-provider
	# `validate` resolves env("DATABASE_URL") but never connects — fall back to a
	# placeholder so it works with no DB configured.
	DATABASE_URL="$${DATABASE_URL:-postgresql://placeholder:placeholder@localhost:5432/placeholder}" pnpm prisma validate

# Apply committed migrations (production / container entrypoint).
migrate: db-provider
	pnpm prisma migrate deploy

# Create + apply a migration in development.
migrate-dev: db-provider
	pnpm prisma migrate dev

# Seed default admin user + roles/permissions.
seed:
	pnpm tsx prisma/seed.ts

# Drop + re-create the dev database, then seed.
db-reset: db-provider
	pnpm prisma migrate reset --force

# --- E2E ------------------------------------------------------------------
# Full product integration/E2E suite. Builds the API, then runs the Vitest
# suite, which brings up isolated Postgres + Redis (docker compose), applies
# migrations + seed, boots the real API as a subprocess, and drives it as a
# black box. External-dependency suites opt in via E2E_DOCKER / E2E_K8S / E2E_LLM.
e2e:
	pnpm build:api
	pnpm test:e2e

# Bring the isolated E2E infra up/down by hand (for debugging a failing run).
e2e-up:
	docker compose -f test/e2e/docker-compose.e2e.yml -p tempoflow-e2e up -d --wait

e2e-down:
	docker compose -f test/e2e/docker-compose.e2e.yml -p tempoflow-e2e down -v

# Kubernetes Job executor E2E. Requires a running minikube cluster.
e2e-k8s: build
	pnpm tsx test/e2e/k8s/job-executor.e2e.mts
