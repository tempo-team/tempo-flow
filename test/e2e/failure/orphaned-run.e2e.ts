// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Orphaned run (worker lost): a RUNNING run whose BullMQ job has vanished is
// failed by the watchdog after the 60s stuck-grace. Gated behind E2E_SLOW
// because the grace + sweep make it ~75s.

import { describe, expect, it } from "vitest"
import { createFlow, httpNode, manualRun } from "../setup/builders"
import { CAP } from "../setup/config"
import { redisCli } from "../setup/proc"
import { waitForRun } from "../setup/wait"

describe.runIf(CAP.slow)("orphaned run", () => {
  it("fails a stuck RUNNING run whose worker/job is gone", async () => {
    // Node sleeps long enough that the watchdog (≈75s) acts before it finishes.
    const flow = await createFlow({
      nodes: [httpNode("a", "/slow/120000", { timeoutMs: 130_000 })],
    })
    const runId = await manualRun(flow.id)
    await waitForRun(runId, "RUNNING", { timeout: 10_000 })

    // Simulate the worker/job vanishing: delete the BullMQ job hash so
    // queue.getJob() returns null → isOrphaned() is true.
    await redisCli(["DEL", `bull:flow-run:${runId}`])

    const run = await waitForRun(runId, "FAILED", { timeout: 100_000 })
    expect(run.status).toBe("FAILED")
  }, 120_000)
})
