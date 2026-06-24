// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Flow SLA: a run that overruns flow.slaMs is failed by the watchdog. The node
// sleeps far longer than the sweep interval so the watchdog fires first. ~15-20s.

import { describe, expect, it } from "vitest"
import { createFlow, httpNode, manualRun } from "../setup/builders"
import { waitForTerminal } from "../setup/wait"

describe("flow SLA exceeded", () => {
  it("fails a run that overruns its SLA before the node finishes", async () => {
    const flow = await createFlow({
      // SLA 500ms, but the node sleeps 20s → the watchdog (≤15s) fails it first.
      nodes: [httpNode("a", "/slow/20000", { timeoutMs: 30_000 })],
      slaMs: 500,
    })
    const run = await waitForTerminal(await manualRun(flow.id), { timeout: 40_000 })
    expect(run.status).toBe("FAILED")
    expect(run.finishedAt).toBeTruthy()
  }, 40_000)
})
