// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { FlowDefinition } from "@tempo-flow/shared-types"
import { describe, expect, it } from "vitest"
import {
  assertValidFlowDefinition,
  entryNodes,
  validateFlowDefinition,
  validateFlowTrigger,
} from "./validate.js"

function httpNode(id: string, name = id): FlowDefinition["nodes"][number] {
  return { id, name, executor: { type: "http", url: "https://x.test/run", method: "POST" } }
}

describe("validateFlowDefinition", () => {
  it("accepts a valid linear DAG", () => {
    const def: FlowDefinition = {
      nodes: [httpNode("a"), httpNode("b")],
      edges: [{ id: "e1", source: "a", target: "b", on: "success" }],
    }
    expect(validateFlowDefinition(def).ok).toBe(true)
    expect(entryNodes(def)).toEqual(["a"])
  })

  it("accepts multiple successors (fan-out) and condition branches", () => {
    const def: FlowDefinition = {
      nodes: [httpNode("a"), httpNode("b"), httpNode("c")],
      edges: [
        { id: "e1", source: "a", target: "b", on: "success" },
        { id: "e2", source: "a", target: "c", on: "failure" },
      ],
    }
    expect(validateFlowDefinition(def).ok).toBe(true)
  })

  it("rejects a cycle", () => {
    const def: FlowDefinition = {
      nodes: [httpNode("a"), httpNode("b")],
      edges: [
        { id: "e1", source: "a", target: "b", on: "success" },
        { id: "e2", source: "b", target: "a", on: "success" },
      ],
    }
    const result = validateFlowDefinition(def)
    expect(result.ok).toBe(false)
    expect(result.errors.join()).toMatch(/cycle/)
  })

  it("rejects an edge with an unknown endpoint", () => {
    const def = {
      nodes: [httpNode("a")],
      edges: [{ id: "e1", source: "a", target: "ghost", on: "success" }],
    }
    const result = validateFlowDefinition(def)
    expect(result.ok).toBe(false)
    expect(result.errors.join()).toMatch(/unknown target/)
  })

  it("rejects duplicate node ids", () => {
    const def = { nodes: [httpNode("a"), httpNode("a")], edges: [] }
    expect(validateFlowDefinition(def).ok).toBe(false)
  })

  it("rejects an invalid executor (bad url)", () => {
    const def = {
      nodes: [{ id: "a", name: "a", executor: { type: "http", url: "not-a-url", method: "POST" } }],
      edges: [],
    }
    expect(validateFlowDefinition(def).ok).toBe(false)
  })

  it("assertValidFlowDefinition throws on invalid input", () => {
    expect(() => assertValidFlowDefinition({ nodes: [], edges: [] })).toThrow()
  })
})

describe("validateFlowTrigger", () => {
  it("requires expr for cron triggers", () => {
    expect(validateFlowTrigger({ type: "cron" }).ok).toBe(false)
    expect(validateFlowTrigger({ type: "cron", expr: "*/5 * * * * *" }).ok).toBe(true)
    expect(validateFlowTrigger({ type: "manual" }).ok).toBe(true)
  })
})
