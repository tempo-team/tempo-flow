// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { FlowDefinition } from "@tempo-flow/shared-types"
import { describe, expect, it } from "vitest"
import { newEdge, updateNodeInDef } from "./state"

const def: FlowDefinition = {
  nodes: [
    { id: "a", name: "a", executor: { type: "http", url: "http://x", method: "GET" } },
    { id: "b", name: "b", executor: { type: "http", url: "http://x", method: "GET" } },
  ],
  edges: [{ id: "e1", source: "a", target: "b", on: "success" }],
}

describe("updateNodeInDef", () => {
  it("remaps edges when a node id is renamed", () => {
    const renamed = { ...def.nodes[0], id: "extract" }
    const next = updateNodeInDef(def, "a", renamed)
    expect(next.nodes.map((n) => n.id)).toEqual(["extract", "b"])
    expect(next.edges[0]).toMatchObject({ source: "extract", target: "b" })
  })

  it("leaves edges untouched when the id is unchanged", () => {
    const edited = { ...def.nodes[0], name: "renamed-label" }
    const next = updateNodeInDef(def, "a", edited)
    expect(next.edges).toEqual(def.edges)
    expect(next.nodes[0].name).toBe("renamed-label")
  })
})

describe("newEdge", () => {
  it("produces unique ids for edges created in the same tick", () => {
    const ids = Array.from({ length: 100 }, () => newEdge("a", "b").id)
    expect(new Set(ids).size).toBe(100)
  })
})
