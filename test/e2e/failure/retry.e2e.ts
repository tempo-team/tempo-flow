// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Retry/backoff: a flaky node succeeds once retries cover the failures, and
// fails the run once retries are exhausted. NodeRun.attempt records the count.

import { describe, expect, it } from "vitest"
import { createFlow, httpNode, manualRun } from "../setup/builders"
import { nodeRun, waitForTerminal } from "../setup/wait"

const retry = (max: number) => ({ max, backoff: "fixed" as const, delayMs: 50 })

describe("retry / backoff", () => {
  it("recovers when retries cover the transient failures", async () => {
    // /flaky/2 fails twice then succeeds; max=3 retries is enough.
    const flow = await createFlow({
      nodes: [httpNode("a", "/flaky/2?key=recover", { retry: retry(3) })],
    })
    const run = await waitForTerminal(await manualRun(flow.id))
    expect(run.status).toBe("SUCCESS")
    expect(nodeRun(run, "a")?.status).toBe("SUCCESS")
    expect(nodeRun(run, "a")?.attempt).toBe(2)
  })

  it("fails the run once retries are exhausted", async () => {
    // /flaky/5 needs 5 failures cleared; max=2 retries (3 attempts) is not enough.
    const flow = await createFlow({
      nodes: [httpNode("a", "/flaky/5?key=exhaust", { retry: retry(2) })],
    })
    const run = await waitForTerminal(await manualRun(flow.id))
    expect(run.status).toBe("FAILED")
    expect(nodeRun(run, "a")?.status).toBe("FAILED")
    expect(nodeRun(run, "a")?.attempt).toBe(2)
  })
})
