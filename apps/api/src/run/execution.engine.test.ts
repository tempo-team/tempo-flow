// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { ExecResult, JobExecutor } from "@tempo-flow/executors"
import { type FlowDefinition, type FlowNode, RunStatus } from "@tempo-flow/shared-types"
import { describe, expect, it } from "vitest"
import {
  type AdvanceArgs,
  ExecutionEngine,
  type NodeRunRecorder,
  type NodeState,
} from "./execution.engine"

function node(id: string, extra: Partial<FlowNode> = {}): FlowNode {
  return {
    id,
    name: id,
    executor: { type: "http", url: "https://x.test/r", method: "POST" },
    ...extra,
  }
}

interface Row {
  id: string
  nodeId: string
  status: RunStatus
  errorMessage?: string
}

/** In-memory recorder mimicking the (flowRunId,nodeId) unique-claim semantics. */
function recorder() {
  const rows = new Map<string, Row>() // nodeId → row
  let seq = 0
  const calls: Record<string, number> = {}
  const rec: NodeRunRecorder = {
    async loadNodeStates(): Promise<NodeState[]> {
      return [...rows.values()].map((r) => ({ nodeId: r.nodeId, mapIndex: 0, status: r.status }))
    },
    async claimNodeRun(input) {
      if (rows.has(input.nodeId)) return null // already claimed
      const id = `nr-${seq++}`
      rows.set(input.nodeId, { id, nodeId: input.nodeId, status: RunStatus.Running })
      return { id }
    },
    async updateNodeRun(id, patch) {
      const row = [...rows.values()].find((r) => r.id === id)
      if (row) {
        row.status = patch.status
        row.errorMessage = patch.errorMessage
      }
    },
  }
  return { rec, rows, calls }
}

/** Executor whose per-node outcome is scripted; counts calls. */
function executor(outcomes: Record<string, boolean[]>, calls: Record<string, number>): JobExecutor {
  return {
    type: "http",
    async execute(n): Promise<ExecResult> {
      calls[n.id] = (calls[n.id] ?? 0) + 1
      const seq = outcomes[n.id] ?? [true]
      const ok = seq[Math.min(calls[n.id] - 1, seq.length - 1)]
      return ok ? { ok: true, response: { status: 200 } } : { ok: false, errorMessage: "fail" }
    },
  }
}

const BASE = new Date(2026, 5, 20)

function args(rec: NodeRunRecorder, definition: FlowDefinition): AdvanceArgs {
  return { flowRunId: "run1", definition, runDate: BASE, recorder: rec }
}

describe("ExecutionEngine.advance", () => {
  it("runs a linear DAG in order and reports SUCCESS", async () => {
    const def: FlowDefinition = {
      nodes: [node("a"), node("b")],
      edges: [{ id: "e1", source: "a", target: "b", on: "success" }],
    }
    const { rec, rows, calls } = recorder()
    const engine = new ExecutionEngine({ http: executor({}, calls) }, { sleep: async () => {} })
    const result = await engine.advance(args(rec, def))
    expect(result).toEqual({ waiting: false, status: RunStatus.Success })
    expect(rows.get("a")?.status).toBe(RunStatus.Success)
    expect(rows.get("b")?.status).toBe(RunStatus.Success)
  })

  it("runs all successors on fan-out", async () => {
    const def: FlowDefinition = {
      nodes: [node("a"), node("b"), node("c")],
      edges: [
        { id: "e1", source: "a", target: "b", on: "success" },
        { id: "e2", source: "a", target: "c", on: "success" },
      ],
    }
    const { rec, rows, calls } = recorder()
    const engine = new ExecutionEngine({ http: executor({}, calls) }, { sleep: async () => {} })
    await engine.advance(args(rec, def))
    expect(rows.get("b")?.status).toBe(RunStatus.Success)
    expect(rows.get("c")?.status).toBe(RunStatus.Success)
  })

  it("follows the failure branch and skips the success path", async () => {
    const def: FlowDefinition = {
      nodes: [node("a"), node("ok"), node("recover")],
      edges: [
        { id: "e1", source: "a", target: "ok", on: "success" },
        { id: "e2", source: "a", target: "recover", on: "failure" },
      ],
    }
    const { rec, rows, calls } = recorder()
    const engine = new ExecutionEngine(
      { http: executor({ a: [false] }, calls) },
      { sleep: async () => {} },
    )
    const result = await engine.advance(args(rec, def))
    expect(result.status).toBe(RunStatus.Failed)
    expect(rows.has("recover")).toBe(true)
    expect(rows.has("ok")).toBe(false)
  })

  it("retries a node per its policy and succeeds", async () => {
    const def: FlowDefinition = {
      nodes: [node("a", { retry: { max: 2, backoff: "fixed", delayMs: 0 } })],
      edges: [],
    }
    const { rec, calls } = recorder()
    const engine = new ExecutionEngine(
      { http: executor({ a: [false, false, true] }, calls) },
      { sleep: async () => {} },
    )
    const result = await engine.advance(args(rec, def))
    expect(result.status).toBe(RunStatus.Success)
    expect(calls.a).toBe(3) // initial + 2 retries
  })

  it("marks a node FAILED when the executor throws (never strands the run)", async () => {
    const def: FlowDefinition = { nodes: [node("a")], edges: [] }
    const { rec, rows } = recorder()
    const throwing: JobExecutor = {
      type: "http",
      async execute(): Promise<ExecResult> {
        throw new Error("boom")
      },
    }
    const engine = new ExecutionEngine({ http: throwing }, { sleep: async () => {} })
    const result = await engine.advance(args(rec, def))
    expect(result.status).toBe(RunStatus.Failed)
    expect(rows.get("a")?.errorMessage).toBe("boom")
  })

  it("suspends a callback node and gates its successor until the callback lands", async () => {
    const def: FlowDefinition = {
      nodes: [node("a", { completion: "callback" }), node("b")],
      edges: [{ id: "e1", source: "a", target: "b", on: "success" }],
    }
    const { rec, rows, calls } = recorder()
    const engine = new ExecutionEngine(
      { http: executor({}, calls) }, // trigger returns ok
      { sleep: async () => {}, callbackBaseUrl: "https://host" },
    )

    // First advance: triggers `a`, leaves it WAITING, does NOT run `b`.
    const first = await engine.advance(args(rec, def))
    expect(first).toEqual({ waiting: true, status: RunStatus.Running })
    expect(rows.get("a")?.status).toBe(RunStatus.WaitingCallback)
    expect(rows.has("b")).toBe(false)

    // Simulate the completion callback resolving node `a`.
    rows.get("a")!.status = RunStatus.Success

    // Resume: now `b` runs and the run finalizes.
    const second = await engine.advance(args(rec, def))
    expect(second).toEqual({ waiting: false, status: RunStatus.Success })
    expect(rows.get("b")?.status).toBe(RunStatus.Success)
  })

  it("does not double-claim a node across concurrent advances", async () => {
    const def: FlowDefinition = { nodes: [node("a")], edges: [] }
    const { rec, calls } = recorder()
    const engine = new ExecutionEngine({ http: executor({}, calls) }, { sleep: async () => {} })
    await Promise.all([engine.advance(args(rec, def)), engine.advance(args(rec, def))])
    expect(calls.a).toBe(1) // claimed once despite two concurrent advances
  })
})
