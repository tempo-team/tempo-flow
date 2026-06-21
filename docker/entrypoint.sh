#!/bin/sh
# Copyright 2026 The tempo-flow Authors
# SPDX-License-Identifier: Apache-2.0
set -e

PROVIDER="${DATABASE_PROVIDER:-postgresql}"
node scripts/set-db-provider.mjs "$PROVIDER"

# Only the primary (RUN_MIGRATIONS=true) applies migrations; worker replicas skip.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  if [ "$PROVIDER" = "postgresql" ]; then
    pnpm prisma migrate deploy
  else
    pnpm prisma db push --skip-generate --accept-data-loss
  fi
  if [ "${SEED_ON_START:-false}" = "true" ]; then
    pnpm tsx prisma/seed.ts || echo "seed skipped/failed (non-fatal)"
  fi
fi

exec node apps/api/dist/main.js
