// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Node failure → conditional error handling: a failed node fires its failure /
// always edges (not success), and the run finishes FAILED because a node failed
// even though the handler ran.

import { describe, expect, it } from "vitest"
import { createFlow, edge, httpNode, manualRun } from "../setup/builders"
import { nodeRun, waitForTerminal } from "../setup/wait"

describe("node failure → failure branch", () => {
  it("runs the failure + always handlers, skips the success branch, run FAILED", async () => {
    const flow = await createFlow({
      nodes: [
        httpNode("a", "/fail/500"),
        httpNode("onSuccess", "/echo"),
        httpNode("onFailure", "/echo"),
        httpNode("always", "/echo"),
      ],
      edges: [
        edge("a", "onSuccess", "success"),
        edge("a", "onFailure", "failure"),
        edge("a", "always", "always"),
      ],
    })
    const run = await waitForTerminal(await manualRun(flow.id))

    expect(run.status).toBe("FAILED")
    expect(nodeRun(run, "a")?.status).toBe("FAILED")
    expect(nodeRun(run, "a")?.errorMessage).toContain("HTTP 500")
    expect(nodeRun(run, "onFailure")?.status).toBe("SUCCESS")
    expect(nodeRun(run, "always")?.status).toBe("SUCCESS")
    expect(nodeRun(run, "onSuccess")).toBeUndefined()
  })
})
