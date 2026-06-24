// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Approval gate: an interactive trigger on a requiresApproval flow parks the run
// at PENDING_APPROVAL (not enqueued) until approve (→ runs) or reject (→ CANCELED).

import { describe, expect, it } from "vitest"
import { createFlow, httpNode, manualRun } from "../setup/builders"
import { admin } from "../setup/client"
import { getRun, waitForRun, waitForTerminal } from "../setup/wait"

describe("approval gate", () => {
  it("parks at PENDING_APPROVAL, then approve runs it", async () => {
    const flow = await createFlow({ nodes: [httpNode("a", "/echo")], requiresApproval: true })
    const runId = await manualRun(flow.id)

    const parked = await getRun(runId)
    expect(parked.status).toBe("PENDING_APPROVAL")

    const c = await admin()
    const approved = await c.post(`/api/runs/${runId}/approve`, {})
    expect(approved.status).toBe(204)

    const run = await waitForTerminal(runId)
    expect(run.status).toBe("SUCCESS")
  })

  it("reject cancels the run without executing", async () => {
    const flow = await createFlow({ nodes: [httpNode("a", "/echo")], requiresApproval: true })
    const runId = await manualRun(flow.id)
    expect((await getRun(runId)).status).toBe("PENDING_APPROVAL")

    const c = await admin()
    const rejected = await c.post(`/api/runs/${runId}/reject`, { note: "nope" })
    expect(rejected.status).toBe(204)

    const run = await waitForRun(runId, "CANCELED")
    expect(run.status).toBe("CANCELED")
    // Never executed: no node run was recorded.
    expect(run.nodeRuns ?? []).toHaveLength(0)
  })
})
