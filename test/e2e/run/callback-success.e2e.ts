// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Async completion callback (happy path): a completion=callback node only
// triggers the work and parks at WAITING_CALLBACK; when the external job reports
// success to the callback URL, the node resolves to SUCCESS with the reported
// output.

import { describe, expect, it } from "vitest"
import { createFlow, httpNode, manualRun } from "../setup/builders"
import { nodeRun, waitForTerminal } from "../setup/wait"

const asyncPath = (output: unknown) =>
  `/async-callback?output=${encodeURIComponent(JSON.stringify(output))}`

describe("callback success", () => {
  it("resolves a callback node from the external completion signal", async () => {
    const flow = await createFlow({
      nodes: [httpNode("a", asyncPath({ result: "ok" }), { completion: "callback" })],
    })
    const run = await waitForTerminal(await manualRun(flow.id), { timeout: 20_000 })

    expect(run.status).toBe("SUCCESS")
    const a = nodeRun(run, "a")!
    expect(a.status).toBe("SUCCESS")
    expect((a.output as { result?: string }).result).toBe("ok")
  })
})
