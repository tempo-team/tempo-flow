// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Sequential callback gating — the heart of the durable checkpoint-resume engine.
// In A→B→C with B a callback node, C must NOT start until B's external callback
// arrives; the callback result drives the next step, and B's output flows to C.
// Also covers chained callbacks and (gated) durability across a worker restart.

import { describe, expect, it } from "vitest"
import { restartApp } from "../setup/app-process"
import { createFlow, edge, httpNode, manualRun } from "../setup/builders"
import { CAP } from "../setup/config"
import { getRun, nodeRun, waitFor, waitForTerminal } from "../setup/wait"

const asyncPath = (opts: { delayMs?: number; output?: unknown }) => {
  const q = new URLSearchParams()
  if (opts.delayMs) q.set("delayMs", String(opts.delayMs))
  if (opts.output) q.set("output", JSON.stringify(opts.output))
  return `/async-callback?${q.toString()}`
}

describe("callback sequencing (durable checkpoint-resume)", () => {
  it("gates the successor until the callback arrives, then passes its output", async () => {
    const flow = await createFlow({
      nodes: [
        httpNode("a", "/echo"),
        httpNode("b", asyncPath({ delayMs: 1500, output: { result: "ok" } }), {
          completion: "callback",
        }),
        httpNode("c", "/echo", { params: { static: { fromB: "={{ nodes.b.output.result }}" } } }),
      ],
      edges: [edge("a", "b"), edge("b", "c")],
    })
    const runId = await manualRun(flow.id)

    // B parks on the callback; C has not started, run is still RUNNING.
    const parked = await waitFor(
      () => getRun(runId),
      (r) => nodeRun(r, "b")?.status === "WAITING_CALLBACK",
      { timeout: 10_000, label: "B waiting on callback" },
    )
    expect(parked.status).toBe("RUNNING")
    expect(nodeRun(parked, "c")).toBeUndefined()
    expect(nodeRun(parked, "a")?.status).toBe("SUCCESS")

    // Callback arrives → resume → C runs with B's output. A is not re-executed.
    const run = await waitForTerminal(runId, { timeout: 20_000 })
    expect(run.status).toBe("SUCCESS")
    expect(nodeRun(run, "c")?.status).toBe("SUCCESS")
    const cParams = (nodeRun(run, "c")?.request as { params?: Record<string, string> }).params
    expect(cParams?.fromB).toBe("ok")
    expect((run.nodeRuns ?? []).filter((n) => n.nodeId === "a")).toHaveLength(1)
  })

  it("chains callback nodes serially", async () => {
    const flow = await createFlow({
      nodes: [
        httpNode("a", asyncPath({ delayMs: 300, output: { step: "a" } }), {
          completion: "callback",
        }),
        httpNode("b", asyncPath({ delayMs: 300, output: { step: "b" } }), {
          completion: "callback",
        }),
        httpNode("c", "/echo"),
      ],
      edges: [edge("a", "b"), edge("b", "c")],
    })
    const run = await waitForTerminal(await manualRun(flow.id), { timeout: 25_000 })
    expect(run.status).toBe("SUCCESS")
    for (const id of ["a", "b", "c"]) expect(nodeRun(run, id)?.status).toBe("SUCCESS")
  })

  // Durability: the run is parked in the DB while the worker is killed; the
  // callback (arriving after the restart) still resumes it. Gated — it restarts
  // the shared API process, so it must run in isolation.
  it.runIf(CAP.durable)("survives a worker restart while waiting on a callback", async () => {
    const flow = await createFlow({
      nodes: [
        httpNode("b", asyncPath({ delayMs: 4000, output: { result: "ok" } }), {
          completion: "callback",
        }),
      ],
    })
    const runId = await manualRun(flow.id)
    await waitFor(
      () => getRun(runId),
      (r) => nodeRun(r, "b")?.status === "WAITING_CALLBACK",
      {
        timeout: 10_000,
        label: "B waiting before restart",
      },
    )

    await restartApp() // hard kill + respawn while the callback is still pending

    const run = await waitForTerminal(runId, { timeout: 20_000 })
    expect(run.status).toBe("SUCCESS")
  })
})
