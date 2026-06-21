.PHONY: install build typecheck lint test format check dev dev-api dev-web clean \
	db-provider prisma-generate prisma-validate migrate migrate-dev seed db-reset \
	e2e-k8s

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
	pnpm prisma validate

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
# Kubernetes Job executor E2E. Requires a running minikube cluster.
e2e-k8s: build
	pnpm tsx test/e2e/k8s/job-executor.e2e.mts
