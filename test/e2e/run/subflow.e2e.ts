// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Sub-flow node: a parent node launches a child flow and waits for it; the child
// runs to completion (trigger=subflow) and the parent succeeds on it.

import { describe, expect, it } from "vitest"
import { createFlow, httpNode, manualRun, subflowNode } from "../setup/builders"
import { admin } from "../setup/client"
import { type RunView, waitForTerminal } from "../setup/wait"

describe("sub-flow", () => {
  it("launches and waits on a child flow", async () => {
    const child = await createFlow({ name: "child", nodes: [httpNode("c", "/echo")] })
    const parent = await createFlow({
      name: "parent",
      nodes: [subflowNode("s", child.id)],
    })

    const run = await waitForTerminal(await manualRun(parent.id), { timeout: 30_000 })
    expect(run.status).toBe("SUCCESS")

    const c = await admin()
    const childRuns = (await c.get<RunView[]>(`/api/flows/${child.id}/runs`)).body
    expect(childRuns).toHaveLength(1)
    expect(childRuns[0].trigger).toBe("subflow")
    expect(childRuns[0].status).toBe("SUCCESS")
  })
})
