// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Fan-out (forEach): one node instance per array item, all-join (default) gates
// the successor until every instance succeeds; an empty array is a vacuous
// success that still releases the successor.

import { describe, expect, it } from "vitest"
import { createFlow, edge, httpNode, manualRun } from "../setup/builders"
import { type RunView, waitForTerminal } from "../setup/wait"

function instances(run: RunView, nodeId: string) {
  return (run.nodeRuns ?? []).filter((n) => n.nodeId === nodeId)
}

describe("fan-out / join", () => {
  it("runs one instance per item and joins (all) before the successor", async () => {
    const flow = await createFlow({
      nodes: [
        httpNode("fan", "/echo", {
          forEach: "[1, 2, 3]",
          params: { static: { item: "={{ item }}" } },
        }),
        httpNode("after", "/echo"),
      ],
      edges: [edge("fan", "after")],
    })
    const run = await waitForTerminal(await manualRun(flow.id))
    expect(run.status).toBe("SUCCESS")

    const fanInstances = instances(run, "fan")
    expect(fanInstances).toHaveLength(3)
    expect(fanInstances.every((n) => n.status === "SUCCESS")).toBe(true)
    expect(instances(run, "after")).toHaveLength(1)
  })

  it("treats an empty fan-out array as a vacuous success", async () => {
    const flow = await createFlow({
      nodes: [httpNode("fan", "/echo", { forEach: "[]" }), httpNode("after", "/echo")],
      edges: [edge("fan", "after")],
    })
    const run = await waitForTerminal(await manualRun(flow.id))
    expect(run.status).toBe("SUCCESS")
    expect(instances(run, "after")).toHaveLength(1)
  })
})
