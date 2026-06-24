// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Manual trigger: POST /flows/:id/run creates a run that the worker executes to
// SUCCESS, and param overrides reach the node (visible in NodeRun.request).

import { describe, expect, it } from "vitest"
import { createFlow, httpNode, manualRun } from "../setup/builders"
import { nodeRun, waitForTerminal } from "../setup/wait"

describe("manual trigger", () => {
  it("runs a flow to SUCCESS", async () => {
    const flow = await createFlow({ nodes: [httpNode("a", "/echo")] })
    const runId = await manualRun(flow.id)
    const run = await waitForTerminal(runId)
    expect(run.status).toBe("SUCCESS")
    expect(run.trigger).toBe("manual")
    expect(nodeRun(run, "a")?.status).toBe("SUCCESS")
  })

  it("passes param overrides through to the node", async () => {
    const flow = await createFlow({ nodes: [httpNode("a", "/echo")] })
    const runId = await manualRun(flow.id, { params: { region: "kr", tier: "gold" } })
    const run = await waitForTerminal(runId)
    expect(run.status).toBe("SUCCESS")

    const req = nodeRun(run, "a")?.request as { params?: Record<string, string> }
    expect(req.params?.region).toBe("kr")
    expect(req.params?.tier).toBe("gold")
  })
})
