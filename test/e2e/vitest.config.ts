// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// E2E suite config. The tests are black-box HTTP clients (fetch) + a Prisma
// client for DB assertions, so no decorator-metadata transform is needed — the
// API under test runs as the real apps/api/dist/main.js subprocess (booted by
// the global setup). Everything runs in a single persistent fork so the app +
// fixture server start once and the DB is reset per test.

import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root,
  test: {
    include: ["**/*.e2e.ts"],
    globalSetup: ["./setup/global-setup.ts"],
    setupFiles: ["./setup/per-test.ts"],
    hookTimeout: 180_000,
    testTimeout: 60_000,
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    // Tests own their own infra lifecycle; never watch.
    watch: false,
  },
})
