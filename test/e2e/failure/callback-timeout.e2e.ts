// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Callback timeout: a completion=callback node whose callback never arrives is
// failed by the SLA watchdog after its deadline, which then fires the failure
// branch. The watchdog sweeps every 15s, so this test is necessarily ~15-20s.

import { describe, expect, it } from "vitest"
import { createFlow, edge, httpNode, manualRun } from "../setup/builders"
import { nodeRun, waitForTerminal } from "../setup/wait"

describe("callback timeout", () => {
  it("fails the node via the watchdog and fires the failure branch", async () => {
    const flow = await createFlow({
      nodes: [
        // times=0 → fixture acks but never reports → callback never arrives.
        httpNode("a", "/async-callback?times=0", {
          completion: "callback",
          callbackTimeoutMs: 1000,
        }),
        httpNode("onFailure", "/echo"),
      ],
      edges: [edge("a", "onFailure", "failure")],
    })
    const run = await waitForTerminal(await manualRun(flow.id), { timeout: 40_000 })

    expect(run.status).toBe("FAILED")
    expect(nodeRun(run, "a")?.status).toBe("FAILED")
    expect(nodeRun(run, "a")?.errorMessage).toContain("callback timed out")
    expect(nodeRun(run, "onFailure")?.status).toBe("SUCCESS")
  }, 40_000)
})
