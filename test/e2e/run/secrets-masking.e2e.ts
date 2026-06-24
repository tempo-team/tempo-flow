// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Secrets are injected into the running node (the external service receives the
// real value) but masked out of the persisted NodeRun.request — never stored in
// plaintext.

import { describe, expect, it } from "vitest"
import { createFlow, httpNode, manualRun } from "../setup/builders"
import { admin } from "../setup/client"
import { fixtureCalls } from "../setup/fixture-client"
import { nodeRun, waitForTerminal } from "../setup/wait"

const SECRET = "s3cr3t-XYZ-abc-987"

describe("secret injection + masking", () => {
  it("sends the real secret to the node but masks it in the record", async () => {
    const c = await admin()
    const made = await c.post("/api/secrets", { key: "API_TOKEN", value: SECRET, scope: "global" })
    expect(made.status).toBeLessThan(300)

    const flow = await createFlow({
      nodes: [httpNode("a", "/echo", { headers: { authorization: "={{ secrets.API_TOKEN }}" } })],
    })
    const run = await waitForTerminal(await manualRun(flow.id))
    expect(run.status).toBe("SUCCESS")

    // The fixture (the "external service") received the real secret value.
    const calls = await fixtureCalls("/echo")
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(calls.at(-1)!.headers.authorization).toBe(SECRET)

    // The persisted request masks it — the plaintext never appears.
    const req = nodeRun(run, "a")?.request as { headers?: Record<string, string> }
    expect(req.headers?.authorization).toBe("***")
    expect(JSON.stringify(run.nodeRuns)).not.toContain(SECRET)
  })
})
