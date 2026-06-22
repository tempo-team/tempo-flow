// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { ExecResult, JobExecutor } from "@tempo-flow/executors"
import { type FlowDefinition, type FlowNode, RunStatus } from "@tempo-flow/shared-types"
import { describe, expect, it } from "vitest"
import { ExecutionEngine, type NodeRunRecorder } from "./execution.engine"

function node(id: string): FlowNode {
  return { id, name: id, executor: { type: "http", url: "https://x.test/r", method: "POST" } }
}

/** Records node runs and lets tests script per-node outcomes. */
function setup(outcomes: Record<string, boolean[]>) {
  const updates: { nodeId: string; status: RunStatus; attempt: number }[] = []
  const calls: Record<string, number> = {}
  const idToNode: Record<string, string> = {}

  const recorder: NodeRunRecorder = {
    async createNodeRun({ nodeId }) {
      const id = `nr-${nodeId}`
      idToNode[id] = nodeId
      return { id }
    },
    async updateNodeRun(id, patch) {
      updates.push({ nodeId: idToNode[id], status: patch.status, attempt: patch.attempt })
    },
  }

  const executor: JobExecutor = {
    type: "http",
    async execute(n): Promise<ExecResult> {
      calls[n.id] = (calls[n.id] ?? 0) + 1
      const seq = outcomes[n.id] ?? [true]
      const ok = seq[Math.min(calls[n.id] - 1, seq.length - 1)]
      return ok ? { ok: true, response: { status: 200 } } : { ok: false, errorMessage: "fail" }
    },
  }

  const engine = new ExecutionEngine({ http: executor }, async () => {})
  return { engine, recorder, updates, calls }
}

const recorderRunDate = new Date(2026, 5, 20)

describe("ExecutionEngine", () => {
  it("runs a linear DAG in order and reports SUCCESS", async () => {
    const def: FlowDefinition = {
      nodes: [node("a"), node("b")],
      edges: [{ id: "e1", source: "a", target: "b", on: "success" }],
    }
    const { engine, recorder, updates } = setup({})
    const status = await engine.runFlow({
      flowRunId: "run1",
      definition: def,
      runDate: recorderRunDate,
      recorder,
    })
    expect(status).toBe(RunStatus.Success)
    expect(updates.map((u) => u.nodeId)).toEqual(["a", "b"])
  })

  it("runs all successors on fan-out", async () => {
    const def: FlowDefinition = {
      nodes: [node("a"), node("b"), node("c")],
      edges: [
        { id: "e1", source: "a", target: "b", on: "success" },
        { id: "e2", source: "a", target: "c", on: "success" },
      ],
    }
    const { engine, recorder, updates } = setup({})
    await engine.runFlow({ flowRunId: "r", definition: def, runDate: recorderRunDate, recorder })
    expect(new Set(updates.map((u) => u.nodeId))).toEqual(new Set(["a", "b", "c"]))
  })

  it("follows the failure branch and skips the success path", async () => {
    const def: FlowDefinition = {
      nodes: [node("a"), node("ok"), node("recover")],
      edges: [
        { id: "e1", source: "a", target: "ok", on: "success" },
        { id: "e2", source: "a", target: "recover", on: "failure" },
      ],
    }
    const { engine, recorder, updates } = setup({ a: [false] })
    const status = await engine.runFlow({
      flowRunId: "r",
      definition: def,
      runDate: recorderRunDate,
      recorder,
    })
    expect(status).toBe(RunStatus.Failed)
    const ran = updates.map((u) => u.nodeId)
    expect(ran).toContain("recover")
    expect(ran).not.toContain("ok")
  })

  it("retries a node per its policy and succeeds", async () => {
    const def: FlowDefinition = {
      nodes: [{ ...node("a"), retry: { max: 2, backoff: "fixed", delayMs: 0 } }],
      edges: [],
    }
    const { engine, recorder, updates, calls } = setup({ a: [false, false, true] })
    const status = await engine.runFlow({
      flowRunId: "r",
      definition: def,
      runDate: recorderRunDate,
      recorder,
    })
    expect(status).toBe(RunStatus.Success)
    expect(calls.a).toBe(3) // initial + 2 retries
    expect(updates[0].attempt).toBe(2)
  })

  it("marks a node FAILED when the executor throws (never strands the run)", async () => {
    const def: FlowDefinition = { nodes: [node("a")], edges: [] }
    const updates: { nodeId: string; status: RunStatus; errorMessage?: string }[] = []
    const recorder: NodeRunRecorder = {
      async createNodeRun() {
        return { id: "nr-a" }
      },
      async updateNodeRun(_id, patch) {
        updates.push({ nodeId: "a", status: patch.status, errorMessage: patch.errorMessage })
      },
    }
    const throwing: JobExecutor = {
      type: "http",
      async execute(): Promise<ExecResult> {
        throw new Error("boom")
      },
    }
    const engine = new ExecutionEngine({ http: throwing }, async () => {})
    // Must resolve (not reject) so the run is recorded, not left RUNNING.
    const status = await engine.runFlow({
      flowRunId: "r",
      definition: def,
      runDate: recorderRunDate,
      recorder,
    })
    expect(status).toBe(RunStatus.Failed)
    expect(updates[0]).toMatchObject({ status: RunStatus.Failed, errorMessage: "boom" })
  })

  it("marks a node FAILED when retries are exhausted", async () => {
    const def: FlowDefinition = {
      nodes: [{ ...node("a"), retry: { max: 1, backoff: "fixed", delayMs: 0 } }],
      edges: [],
    }
    const { engine, recorder, updates } = setup({ a: [false, false] })
    const status = await engine.runFlow({
      flowRunId: "r",
      definition: def,
      runDate: recorderRunDate,
      recorder,
    })
    expect(status).toBe(RunStatus.Failed)
    expect(updates[0].status).toBe(RunStatus.Failed)
  })
})
