// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Per-test isolation: truncate flow/run tables, flush Redis (clears BullMQ jobs,
// scheduler tick locks, event streams, webhook rate-limit counters), and reset
// the fixture server's recorded calls. Seed data (users/roles/permissions) is
// preserved so login keeps working.
//
// NOTE: the long-lived API subprocess keeps any cron jobs it registered in
// memory. Truncating Flow rows here does NOT unregister them, so cron-based
// tests must clean up by disabling/deleting their flow via the API (which calls
// scheduler.unregister) — see the trigger/cron suite.

import { truncateAll } from "./db"
import { resetFixture } from "./fixture-client"
import { redisCli } from "./proc"

export async function resetState(): Promise<void> {
  await truncateAll()
  await redisCli(["flushall"])
  await resetFixture()
}
