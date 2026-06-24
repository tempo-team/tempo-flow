// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Run-level guardrails + sub-flow safety: cycle detection, allowedToolFlows,
// maxNodeRuns, and maxSubflowDepth all stop a run with a clear failure.

import { describe, expect, it } from "vitest"
import { createFlow, edge, httpNode, manualRun, subflowNode } from "../setup/builders"
import { admin } from "../setup/client"
import { nodeRun, waitForTerminal } from "../setup/wait"

describe("sub-flow / guardrail failures", () => {
  it("detects a sub-flow cycle (flow launching itself)", async () => {
    const c = await admin()
    const flow = await createFlow({ nodes: [httpNode("h", "/echo")] })
    // Rewrite it to a single sub-flow node pointing at itself.
    await c.patch(`/api/flows/${flow.id}`, {
      definition: { nodes: [subflowNode("s", flow.id)], edges: [] },
    })
    const run = await waitForTerminal(await manualRun(flow.id), { timeout: 30_000 })
    expect(run.status).toBe("FAILED")
    expect(nodeRun(run, "s")?.errorMessage?.toLowerCase()).toContain("cycle")
  })

  it("rejects a sub-flow not in allowedToolFlows", async () => {
    const child = await createFlow({ name: "child", nodes: [httpNode("c", "/echo")] })
    const parent = await createFlow({
      name: "parent",
      nodes: [subflowNode("s", child.id)],
      guardrails: { allowedToolFlows: ["not-this-one"] },
    })
    const run = await waitForTerminal(await manualRun(parent.id), { timeout: 30_000 })
    expect(run.status).toBe("FAILED")
    expect(nodeRun(run, "s")?.errorMessage ?? "").toContain("allowedToolFlows")
  })

  it("enforces maxNodeRuns", async () => {
    const flow = await createFlow({
      nodes: [httpNode("a", "/echo"), httpNode("b", "/echo"), httpNode("c", "/echo")],
      edges: [edge("a", "b"), edge("b", "c")],
      guardrails: { maxNodeRuns: 2 },
    })
    const run = await waitForTerminal(await manualRun(flow.id))
    expect(run.status).toBe("FAILED")
    expect((run.nodeRuns ?? []).length).toBeLessThanOrEqual(2)
  })

  it("enforces maxSubflowDepth across nested sub-flows", async () => {
    const leaf = await createFlow({ name: "leaf", nodes: [httpNode("l", "/echo")] })
    const mid = await createFlow({
      name: "mid",
      nodes: [subflowNode("s", leaf.id)],
      guardrails: { maxSubflowDepth: 1 },
    })
    const top = await createFlow({
      name: "top",
      nodes: [subflowNode("s", mid.id)],
      guardrails: { maxSubflowDepth: 1 },
    })
    const run = await waitForTerminal(await manualRun(top.id), { timeout: 30_000 })
    expect(run.status).toBe("FAILED")
  })
})
