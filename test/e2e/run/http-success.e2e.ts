// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Normal processing over the HTTP executor: a linear DAG runs in order, and
// date/param templating resolves into the request the node issues.

import { describe, expect, it } from "vitest"
import { createFlow, edge, httpNode, manualRun } from "../setup/builders"
import { nodeRun, waitForTerminal } from "../setup/wait"

describe("http success", () => {
  it("runs a linear A→B→C DAG in order", async () => {
    const flow = await createFlow({
      nodes: [httpNode("a", "/echo"), httpNode("b", "/echo"), httpNode("c", "/echo")],
      edges: [edge("a", "b"), edge("b", "c")],
    })
    const run = await waitForTerminal(await manualRun(flow.id))
    expect(run.status).toBe("SUCCESS")

    const a = nodeRun(run, "a")!
    const b = nodeRun(run, "b")!
    const c = nodeRun(run, "c")!
    expect([a.status, b.status, c.status]).toEqual(["SUCCESS", "SUCCESS", "SUCCESS"])
    // Execution order: each starts no earlier than its predecessor.
    expect(new Date(a.startedAt!).getTime()).toBeLessThanOrEqual(new Date(b.startedAt!).getTime())
    expect(new Date(b.startedAt!).getTime()).toBeLessThanOrEqual(new Date(c.startedAt!).getTime())
  })

  it("resolves date params into the issued request", async () => {
    const flow = await createFlow({
      nodes: [
        httpNode("a", "/echo", {
          params: { dateParams: [{ key: "d", expr: "${RUN_DATE}", format: "yyyyMMdd" }] },
        }),
      ],
    })
    const run = await waitForTerminal(
      await manualRun(flow.id, { runDate: "2026-01-15T12:00:00.000Z" }),
    )
    expect(run.status).toBe("SUCCESS")

    const params = (nodeRun(run, "a")?.request as { params?: Record<string, string> }).params
    expect(params?.d).toMatch(/^\d{8}$/)
    expect(params?.d?.startsWith("2026")).toBe(true)
  })

  it("merges static params and overrides", async () => {
    const flow = await createFlow({
      nodes: [httpNode("a", "/echo", { params: { static: { fixed: "x", over: "default" } } })],
    })
    const run = await waitForTerminal(await manualRun(flow.id, { params: { over: "y" } }))
    const params = (nodeRun(run, "a")?.request as { params?: Record<string, string> }).params
    expect(params?.fixed).toBe("x")
    expect(params?.over).toBe("y")
  })
})
