// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { FlowDefinition } from "@tempo-flow/shared-types"
import { describe, expect, it } from "vitest"
import { fromReactFlow, toReactFlow } from "./flow-graph"

const def: FlowDefinition = {
  nodes: [
    { id: "a", name: "extract", executor: { type: "http", url: "https://x/r", method: "POST" } },
    { id: "b", name: "load", executor: { type: "k8s", image: "etl:1" } },
  ],
  edges: [
    { id: "e1", source: "a", target: "b", on: "success" },
    { id: "e2", source: "a", target: "b", on: "failure" },
  ],
}

describe("flow-graph", () => {
  it("converts a definition to React Flow nodes/edges with layout", () => {
    const { nodes, edges } = toReactFlow(def)
    expect(nodes.map((n) => n.id)).toEqual(["a", "b"])
    expect(nodes[0].data.label).toBe("extract")
    expect(nodes[1].data.executor).toBe("k8s")
    // dagre assigns non-zero positions
    expect(nodes[1].position.x).not.toBe(0)
    expect(edges).toHaveLength(2)
    expect(edges[0].label).toBe("success")
  })

  it("round-trips definition -> graph -> definition", () => {
    const { nodes, edges } = toReactFlow(def)
    const back = fromReactFlow(def, nodes, edges)
    expect(back.nodes.map((n) => n.id)).toEqual(["a", "b"])
    expect(back.nodes[1].executor.type).toBe("k8s")
    expect(back.edges.map((e) => e.on)).toEqual(["success", "failure"])
  })
})
