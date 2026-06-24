// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { RunContext } from "@tempo-flow/executors"
import { toJson } from "@tempo-flow/shared-types"
import { describe, expect, it, vi } from "vitest"
import type { PrismaService } from "../prisma/prisma.service"
import type { RunLauncherService } from "./run-launcher.service"
import { makeSubflowToolRunner } from "./subflow-tool-runner"

const ctx = (flowRunId: string): RunContext => ({
  flowRunId,
  nodeId: "n1",
  runDate: new Date("2026-06-24T00:00:00Z"),
})

function build(opts: {
  runs: Record<string, { flowId?: string; parentRunId?: string | null; status?: string }>
  nodeOutputs?: { nodeId: string; output: unknown }[]
  childId?: string
}) {
  const launch = vi.fn().mockResolvedValue({ id: opts.childId ?? "child-1" })
  const findUnique = vi.fn(
    async ({ where }: { where: { id: string } }) => opts.runs[where.id] ?? null,
  )
  const findMany = vi.fn(async () =>
    (opts.nodeOutputs ?? []).map((o) => ({ nodeId: o.nodeId, output: toJson(o.output) })),
  )
  const prisma = {
    flowRun: { findUnique },
    nodeRun: { findMany },
  } as unknown as PrismaService
  const launcher = { launch } as unknown as RunLauncherService
  return { run: makeSubflowToolRunner(launcher, prisma), launch, findMany }
}

describe("makeSubflowToolRunner", () => {
  it("launches the tool flow with mapped params and returns its node outputs", async () => {
    const { run, launch } = build({
      runs: {
        "run-A": { flowId: "flow-A", parentRunId: null },
        "child-1": { status: "SUCCESS" },
      },
      nodeOutputs: [{ nodeId: "fetch", output: { temp: 25 } }],
      childId: "child-1",
    })
    const result = await run({
      flowId: "tool-flow",
      input: { city: "Seoul", days: 3 },
      ctx: ctx("run-A"),
    })
    // String fields pass through; non-strings are JSON-encoded for params.
    expect(launch).toHaveBeenCalledWith({
      flowId: "tool-flow",
      trigger: "subflow",
      params: { city: "Seoul", days: "3" },
      parentRunId: "run-A",
    })
    expect(result).toEqual({
      status: "SUCCESS",
      outputs: [{ nodeId: "fetch", output: { temp: 25 } }],
    })
  })

  it("throws (refuses to launch) a tool flow that would cycle", async () => {
    const { run, launch } = build({
      runs: { "run-A": { flowId: "flow-A", parentRunId: null } },
    })
    await expect(run({ flowId: "flow-A", input: {}, ctx: ctx("run-A") })).rejects.toThrow(/cycle/)
    expect(launch).not.toHaveBeenCalled()
  })

  it("wraps a non-object tool input under `input`", async () => {
    const { run, launch } = build({
      runs: {
        "run-A": { flowId: "flow-A", parentRunId: null },
        "child-1": { status: "SUCCESS" },
      },
      childId: "child-1",
    })
    await run({ flowId: "tool-flow", input: "just a string", ctx: ctx("run-A") })
    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({ params: { input: JSON.stringify("just a string") } }),
    )
  })
})
