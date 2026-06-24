// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Conditional branching: a node's success fires only its success edges; the
// failure branch stays gated.

import { describe, expect, it } from "vitest"
import { createFlow, edge, httpNode, manualRun } from "../setup/builders"
import { nodeRun, waitForTerminal } from "../setup/wait"

describe("conditional branching", () => {
  it("fires the success branch, not the failure branch", async () => {
    const flow = await createFlow({
      nodes: [
        httpNode("a", "/echo"),
        httpNode("onSuccess", "/echo"),
        httpNode("onFailure", "/echo"),
      ],
      edges: [edge("a", "onSuccess", "success"), edge("a", "onFailure", "failure")],
    })
    const run = await waitForTerminal(await manualRun(flow.id))

    expect(run.status).toBe("SUCCESS")
    expect(nodeRun(run, "a")?.status).toBe("SUCCESS")
    expect(nodeRun(run, "onSuccess")?.status).toBe("SUCCESS")
    expect(nodeRun(run, "onFailure")).toBeUndefined()
  })
})
