// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Cancellation + callback idempotency: a run can be canceled while running or
// while waiting on a callback (and stays canceled — a finishing worker doesn't
// overwrite it); a duplicate callback report is a no-op.

import { describe, expect, it } from "vitest"
import { createFlow, httpNode, manualRun } from "../setup/builders"
import { admin } from "../setup/client"
import { getRun, nodeRun, waitFor, waitForRun, waitForTerminal } from "../setup/wait"

const asyncPath = (opts: { delayMs?: number; times?: number; output?: unknown }) => {
  const q = new URLSearchParams()
  if (opts.delayMs) q.set("delayMs", String(opts.delayMs))
  if (opts.times !== undefined) q.set("times", String(opts.times))
  if (opts.output) q.set("output", JSON.stringify(opts.output))
  return `/async-callback?${q.toString()}`
}

describe("cancel + callback idempotency", () => {
  it("cancels a running run and it stays CANCELED", async () => {
    const flow = await createFlow({ nodes: [httpNode("a", "/slow/3000")] })
    const runId = await manualRun(flow.id)
    await waitForRun(runId, "RUNNING", { timeout: 10_000 })

    const c = await admin()
    const cancel = await c.post(`/api/runs/${runId}/cancel`, {})
    expect(cancel.status).toBe(200)
    expect((await getRun(runId)).status).toBe("CANCELED")

    // After the worker finishes the in-flight node, the run is still CANCELED.
    await new Promise((r) => setTimeout(r, 4000))
    expect((await getRun(runId)).status).toBe("CANCELED")
  })

  it("cancels a run waiting on a callback", async () => {
    const flow = await createFlow({
      nodes: [httpNode("a", asyncPath({ delayMs: 30_000 }), { completion: "callback" })],
    })
    const runId = await manualRun(flow.id)
    await waitFor(
      () => getRun(runId),
      (r) => nodeRun(r, "a")?.status === "WAITING_CALLBACK",
      {
        timeout: 10_000,
        label: "node waiting on callback",
      },
    )

    const c = await admin()
    expect((await c.post(`/api/runs/${runId}/cancel`, {})).status).toBe(200)
    expect((await getRun(runId)).status).toBe("CANCELED")
  })

  it("ignores a duplicate callback report (idempotent)", async () => {
    const flow = await createFlow({
      nodes: [
        httpNode("a", asyncPath({ delayMs: 50, times: 2, output: { result: "ok" } }), {
          completion: "callback",
        }),
      ],
    })
    const run = await waitForTerminal(await manualRun(flow.id), { timeout: 20_000 })
    expect(run.status).toBe("SUCCESS")
    expect(nodeRun(run, "a")?.status).toBe("SUCCESS")
    expect((nodeRun(run, "a")?.output as { result?: string }).result).toBe("ok")
  })
})
