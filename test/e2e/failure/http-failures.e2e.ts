// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// HTTP executor failure modes: non-2xx status codes and request timeouts surface
// as a failed node with a descriptive errorMessage.

import { describe, expect, it } from "vitest"
import { createFlow, httpNode, manualRun } from "../setup/builders"
import { nodeRun, waitForTerminal } from "../setup/wait"

describe("http failures", () => {
  it("fails on a 5xx response", async () => {
    const flow = await createFlow({ nodes: [httpNode("a", "/fail/500")] })
    const run = await waitForTerminal(await manualRun(flow.id))
    expect(run.status).toBe("FAILED")
    expect(nodeRun(run, "a")?.errorMessage).toBe("HTTP 500")
  })

  it("fails on a 4xx response", async () => {
    const flow = await createFlow({ nodes: [httpNode("a", "/fail/404")] })
    const run = await waitForTerminal(await manualRun(flow.id))
    expect(run.status).toBe("FAILED")
    expect(nodeRun(run, "a")?.errorMessage).toBe("HTTP 404")
  })

  it("fails on a timeout", async () => {
    const flow = await createFlow({
      nodes: [httpNode("a", "/slow/3000", { timeoutMs: 500 })],
    })
    const run = await waitForTerminal(await manualRun(flow.id))
    expect(run.status).toBe("FAILED")
    expect(nodeRun(run, "a")?.errorMessage).toContain("timeout")
  })
})
