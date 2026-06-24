// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Fan-out partial failure: with item 2 of [1,2,3] failing, the join policy
// decides the node (and run) outcome — all fails, any succeeds, ratio by
// threshold. Also: a fan-out larger than the node-run budget fails immediately.

import { describe, expect, it } from "vitest"
import { createFlow, httpNode, manualRun } from "../setup/builders"
import { nodeRun, waitForTerminal } from "../setup/wait"

function fanFlow(join: "all" | "any" | "ratio", joinRatio?: number) {
  return createFlow({
    nodes: [
      httpNode("fan", "/fail-items?fail=2", {
        paramsIn: "query",
        params: { static: { item: "={{ item }}" } },
        forEach: "[1, 2, 3]",
        join,
        ...(joinRatio !== undefined ? { joinRatio } : {}),
      }),
    ],
  })
}

describe("fan-out partial failure / join policy", () => {
  it("join=all → one failure fails the node", async () => {
    const run = await waitForTerminal(await manualRun((await fanFlow("all")).id))
    expect(run.status).toBe("FAILED")
  })

  it("join=any → one success passes the node", async () => {
    const run = await waitForTerminal(await manualRun((await fanFlow("any")).id))
    expect(run.status).toBe("SUCCESS")
  })

  it("join=ratio met (0.6 ≤ 2/3) → success", async () => {
    const run = await waitForTerminal(await manualRun((await fanFlow("ratio", 0.6)).id))
    expect(run.status).toBe("SUCCESS")
  })

  it("join=ratio unmet (0.7 > 2/3) → failure", async () => {
    const run = await waitForTerminal(await manualRun((await fanFlow("ratio", 0.7)).id))
    expect(run.status).toBe("FAILED")
  })

  it("fan-out exceeding the node-run budget fails immediately", async () => {
    const flow = await createFlow({
      nodes: [
        httpNode("fan", "/echo", {
          paramsIn: "query",
          params: { static: { item: "={{ item }}" } },
          forEach: "[1, 2, 3, 4, 5]",
        }),
      ],
      guardrails: { maxNodeRuns: 3 },
    })
    const run = await waitForTerminal(await manualRun(flow.id))
    expect(run.status).toBe("FAILED")
    expect(nodeRun(run, "fan")?.errorMessage ?? "").toContain("guardrail")
  })
})
