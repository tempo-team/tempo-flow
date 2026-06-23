// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { FlowNode } from "@tempo-flow/shared-types"
import { describe, expect, it, vi } from "vitest"
import type { RunContext } from "@tempo-flow/executors"
import type { PrismaService } from "../prisma/prisma.service"
import type { RunLauncherService } from "./run-launcher.service"
import { SubflowExecutor } from "./subflow.executor"

const node = (flowId: string): FlowNode => ({
  id: "n1",
  name: "child",
  executor: { type: "subflow", flowId },
  timeoutMs: 5000,
})

const ctx = (flowRunId: string): RunContext => ({
  flowRunId,
  nodeId: "n1",
  runDate: new Date("2026-06-22T00:00:00Z"),
})

function build(opts: {
  // findUnique answers keyed by run id (cycle walk + status polling)
  runs: Record<string, { flowId?: string; parentRunId?: string | null; status?: string }>
  childId?: string
}) {
  const launch = vi.fn().mockResolvedValue({ id: opts.childId ?? "child-1" })
  const findUnique = vi.fn(
    async ({ where }: { where: { id: string } }) => opts.runs[where.id] ?? null,
  )
  const prisma = { flowRun: { findUnique } } as unknown as PrismaService
  const launcher = { launch } as unknown as RunLauncherService
  return { exec: new SubflowExecutor(launcher, prisma), launch, findUnique }
}

describe("SubflowExecutor", () => {
  it("rejects a direct self-cycle without launching", async () => {
    // current run parent-of-self: run-A belongs to flow-A; launching flow-A again is a cycle.
    const { exec, launch } = build({
      runs: { "run-A": { flowId: "flow-A", parentRunId: null } },
    })
    const result = await exec.execute(node("flow-A"), ctx("run-A"))
    expect(result.ok).toBe(false)
    expect(result.errorMessage).toContain("cycle")
    expect(launch).not.toHaveBeenCalled()
  })

  it("rejects a transitive cycle up the parent chain", async () => {
    // run-B (flow-B) ← parent run-A (flow-A). Launching flow-A from run-B recurses.
    const { exec, launch } = build({
      runs: {
        "run-B": { flowId: "flow-B", parentRunId: "run-A" },
        "run-A": { flowId: "flow-A", parentRunId: null },
      },
    })
    const result = await exec.execute(node("flow-A"), ctx("run-B"))
    expect(result.ok).toBe(false)
    expect(launch).not.toHaveBeenCalled()
  })

  it("launches the child and succeeds when it ends SUCCESS", async () => {
    const { exec, launch } = build({
      runs: {
        "run-A": { flowId: "flow-A", parentRunId: null },
        "child-1": { status: "SUCCESS" },
      },
      childId: "child-1",
    })
    const result = await exec.execute(node("flow-B"), ctx("run-A"))
    expect(launch).toHaveBeenCalledWith({
      flowId: "flow-B",
      trigger: "subflow",
      params: undefined,
      parentRunId: "run-A",
    })
    expect(result.ok).toBe(true)
    expect(result.response).toMatchObject({ childRunId: "child-1", status: "SUCCESS" })
  })

  it("fails the node when the child run fails", async () => {
    const { exec } = build({
      runs: {
        "run-A": { flowId: "flow-A", parentRunId: null },
        "child-1": { status: "FAILED" },
      },
      childId: "child-1",
    })
    const result = await exec.execute(node("flow-B"), ctx("run-A"))
    expect(result.ok).toBe(false)
    expect(result.errorMessage).toContain("FAILED")
  })
})
