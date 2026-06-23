// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { ExecResult, JobExecutor } from "@tempo-flow/executors"
import { type FlowDefinition, type FlowNode, RunStatus } from "@tempo-flow/shared-types"
import { describe, expect, it } from "vitest"
import {
  type AdvanceArgs,
  ExecutionEngine,
  type NodeOutput,
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
  mapIndex: number
  status: RunStatus
  output?: unknown
  errorMessage?: string
}

/** In-memory recorder mimicking the (nodeId,mapIndex) unique-claim semantics. */
function recorder() {
  const rows = new Map<string, Row>() // `${nodeId}:${mapIndex}` → row
  let seq = 0
  const rec: NodeRunRecorder = {
    async loadNodeStates(): Promise<NodeState[]> {
      return [...rows.values()].map((r) => ({
        nodeId: r.nodeId,
        mapIndex: r.mapIndex,
        status: r.status,
      }))
    },
    async loadNodeOutputs(): Promise<NodeOutput[]> {
      return [...rows.values()]
        .filter((r) => r.output !== undefined)
        .map((r) => ({ nodeId: r.nodeId, mapIndex: r.mapIndex, output: r.output }))
    },
    async claimNodeRun(input) {
      const key = `${input.nodeId}:${input.mapIndex}`
      if (rows.has(key)) return null
      const id = `nr-${seq++}`
      rows.set(key, {
        id,
        nodeId: input.nodeId,
        mapIndex: input.mapIndex,
        status: RunStatus.Running,
      })
      return { id }
    },
    async updateNodeRun(id, patch) {
      const row = [...rows.values()].find((r) => r.id === id)
      if (row) {
        row.status = patch.status
        row.output = patch.output
        row.errorMessage = patch.errorMessage
      }
    },
  }
  return { rec, rows }
}

/** Executor: echoes the fan-out item as output; outcome scriptable. */
function executor(
  calls: Record<string, number>,
  opts: { fail?: (item: unknown) => boolean } = {},
): JobExecutor {
  return {
    type: "http",
    async execute(n, ctx): Promise<ExecResult> {
      calls[n.id] = (calls[n.id] ?? 0) + 1
      if (opts.fail?.(ctx.item)) return { ok: false, errorMessage: "fail" }
      return { ok: true, output: ctx.item ?? { ok: true } }
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
    const { rec, rows } = recorder()
    const engine = new ExecutionEngine({ http: executor({}) }, { sleep: async () => {} })
    const result = await engine.advance(args(rec, def))
    expect(result).toEqual({ waiting: false, status: RunStatus.Success })
    expect(rows.get("a:0")?.status).toBe(RunStatus.Success)
    expect(rows.get("b:0")?.status).toBe(RunStatus.Success)
  })

  it("follows the failure branch and skips the success path", async () => {
    const def: FlowDefinition = {
      nodes: [node("a"), node("ok"), node("recover")],
      edges: [
        { id: "e1", source: "a", target: "ok", on: "success" },
        { id: "e2", source: "a", target: "recover", on: "failure" },
      ],
    }
    const { rec, rows } = recorder()
    const engine = new ExecutionEngine(
      { http: executor({}, { fail: () => true }) },
      { sleep: async () => {} },
    )
    const result = await engine.advance(args(rec, def))
    expect(result.status).toBe(RunStatus.Failed)
    expect(rows.has("recover:0")).toBe(true)
    expect(rows.has("ok:0")).toBe(false)
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
    expect(rows.get("a:0")?.errorMessage).toBe("boom")
  })

  it("suspends a callback node and gates its successor until the callback lands", async () => {
    const def: FlowDefinition = {
      nodes: [node("a", { completion: "callback" }), node("b")],
      edges: [{ id: "e1", source: "a", target: "b", on: "success" }],
    }
    const { rec, rows } = recorder()
    const engine = new ExecutionEngine(
      { http: executor({}) },
      { sleep: async () => {}, callbackBaseUrl: "https://host" },
    )
    const first = await engine.advance(args(rec, def))
    expect(first).toEqual({ waiting: true, status: RunStatus.Running })
    expect(rows.get("a:0")?.status).toBe(RunStatus.WaitingCallback)
    expect(rows.has("b:0")).toBe(false)

    rows.get("a:0")!.status = RunStatus.Success // simulate the callback
    const second = await engine.advance(args(rec, def))
    expect(second).toEqual({ waiting: false, status: RunStatus.Success })
    expect(rows.get("b:0")?.status).toBe(RunStatus.Success)
  })

  // --- fan-out -----------------------------------------------------------

  it("fans out over an array: one instance per item, then the successor runs", async () => {
    const def: FlowDefinition = {
      nodes: [node("map", { forEach: "[10, 20, 30]" }), node("after")],
      edges: [{ id: "e1", source: "map", target: "after", on: "success" }],
    }
    const { rec, rows } = recorder()
    const engine = new ExecutionEngine({ http: executor({}) }, { sleep: async () => {} })
    const result = await engine.advance(args(rec, def))
    expect(result.status).toBe(RunStatus.Success)
    // three instances, each got its item as output
    expect(rows.get("map:0")?.output).toBe(10)
    expect(rows.get("map:1")?.output).toBe(20)
    expect(rows.get("map:2")?.output).toBe(30)
    expect(rows.get("after:0")?.status).toBe(RunStatus.Success)
  })

  it("join=all: a single failed instance fails the node (failure branch fires)", async () => {
    const def: FlowDefinition = {
      nodes: [node("map", { forEach: "[1, 2, 3]" }), node("ok"), node("recover")],
      edges: [
        { id: "e1", source: "map", target: "ok", on: "success" },
        { id: "e2", source: "map", target: "recover", on: "failure" },
      ],
    }
    const { rec, rows } = recorder()
    const engine = new ExecutionEngine(
      { http: executor({}, { fail: (item) => item === 2 }) },
      { sleep: async () => {} },
    )
    const result = await engine.advance(args(rec, def))
    expect(result.status).toBe(RunStatus.Failed)
    expect(rows.has("recover:0")).toBe(true)
    expect(rows.has("ok:0")).toBe(false)
  })

  it("join=any: succeeds when at least one instance succeeds", async () => {
    const def: FlowDefinition = {
      nodes: [node("map", { forEach: "[1, 2, 3]", join: "any" }), node("after")],
      edges: [{ id: "e1", source: "map", target: "after", on: "success" }],
    }
    const { rec, rows } = recorder()
    const engine = new ExecutionEngine(
      { http: executor({}, { fail: (item) => item !== undefined && item !== 1 }) }, // only item 1 succeeds
      { sleep: async () => {} },
    )
    const result = await engine.advance(args(rec, def))
    expect(result.status).toBe(RunStatus.Success)
    expect(rows.get("after:0")?.status).toBe(RunStatus.Success)
  })

  it("an empty fan-out array succeeds vacuously and runs the successor", async () => {
    const def: FlowDefinition = {
      nodes: [node("map", { forEach: "[]" }), node("after")],
      edges: [{ id: "e1", source: "map", target: "after", on: "success" }],
    }
    const { rec, rows } = recorder()
    const engine = new ExecutionEngine({ http: executor({}) }, { sleep: async () => {} })
    const result = await engine.advance(args(rec, def))
    expect(result.status).toBe(RunStatus.Success)
    expect(rows.get("map:0")?.status).toBe(RunStatus.Success)
    expect(rows.get("after:0")?.status).toBe(RunStatus.Success)
  })

  it("fans out over an upstream node's output array", async () => {
    const def: FlowDefinition = {
      nodes: [node("list"), node("map", { forEach: "nodes.list.output.ids" })],
      edges: [{ id: "e1", source: "list", target: "map", on: "success" }],
    }
    const { rec, rows } = recorder()
    // `list` outputs { ids: [1,2] }; `map` fans out over it.
    const exec: JobExecutor = {
      type: "http",
      async execute(n, ctx): Promise<ExecResult> {
        if (n.id === "list") return { ok: true, output: { ids: [1, 2] } }
        return { ok: true, output: ctx.item }
      },
    }
    const engine = new ExecutionEngine({ http: exec }, { sleep: async () => {} })
    const result = await engine.advance(args(rec, def))
    expect(result.status).toBe(RunStatus.Success)
    expect(rows.get("map:0")?.output).toBe(1)
    expect(rows.get("map:1")?.output).toBe(2)
  })

  it("masks secret values out of the recorded request", async () => {
    const def: FlowDefinition = { nodes: [node("a")], edges: [] }
    const { rec, rows } = recorder()
    const exec: JobExecutor = {
      type: "http",
      async execute(): Promise<ExecResult> {
        // executor echoes a request that embedded the secret value
        return { ok: true, request: { headers: { authorization: "Bearer s3cr3t" } } }
      },
    }
    // capture the request the recorder is asked to persist
    let persisted: unknown
    const orig = rec.updateNodeRun
    rec.updateNodeRun = async (id, patch) => {
      persisted = patch.request
      return orig(id, patch)
    }
    const engine = new ExecutionEngine({ http: exec }, { sleep: async () => {} })
    await engine.advance({ ...args(rec, def), secrets: { TOKEN: "s3cr3t" } })
    expect(JSON.stringify(persisted)).toContain("***")
    expect(JSON.stringify(persisted)).not.toContain("s3cr3t")
    expect(rows.get("a:0")?.status).toBe(RunStatus.Success)
  })

  it("does not double-claim a node across concurrent advances", async () => {
    const def: FlowDefinition = { nodes: [node("a")], edges: [] }
    const { rec } = recorder()
    const calls: Record<string, number> = {}
    const engine = new ExecutionEngine({ http: executor(calls) }, { sleep: async () => {} })
    await Promise.all([engine.advance(args(rec, def)), engine.advance(args(rec, def))])
    expect(calls.a).toBe(1)
  })
})
