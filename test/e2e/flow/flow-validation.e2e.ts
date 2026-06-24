// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Flow definition / trigger validation is rejected with 400 at the API boundary
// (DAG semantics from flow-engine + DTO validation from class-validator).

import { describe, expect, it } from "vitest"
import { httpNode } from "../setup/builders"
import { type ApiClient, admin } from "../setup/client"

async function createRaw(c: ApiClient, definition: unknown, extra: Record<string, unknown> = {}) {
  return c.post("/api/flows", {
    name: "bad",
    definition,
    trigger: { type: "manual" },
    ...extra,
  })
}

describe("flow validation (400)", () => {
  it("rejects a cycle", async () => {
    const c = await admin()
    const res = await createRaw(c, {
      nodes: [httpNode("a", "/echo"), httpNode("b", "/echo")],
      edges: [
        { id: "e1", source: "a", target: "b", on: "success" },
        { id: "e2", source: "b", target: "a", on: "success" },
      ],
    })
    expect(res.status).toBe(400)
  })

  it("rejects an edge with an unknown target", async () => {
    const c = await admin()
    const res = await createRaw(c, {
      nodes: [httpNode("a", "/echo")],
      edges: [{ id: "e1", source: "a", target: "ghost", on: "success" }],
    })
    expect(res.status).toBe(400)
  })

  it("rejects a duplicate node id", async () => {
    const c = await admin()
    const res = await createRaw(c, {
      nodes: [httpNode("a", "/echo"), httpNode("a", "/echo")],
      edges: [],
    })
    expect(res.status).toBe(400)
  })

  it("rejects a self-loop edge", async () => {
    const c = await admin()
    const res = await createRaw(c, {
      nodes: [httpNode("a", "/echo")],
      edges: [{ id: "e1", source: "a", target: "a", on: "success" }],
    })
    expect(res.status).toBe(400)
  })

  it("rejects an empty node list", async () => {
    const c = await admin()
    const res = await createRaw(c, { nodes: [], edges: [] })
    expect(res.status).toBe(400)
  })

  it("rejects an empty name (DTO validation)", async () => {
    const c = await admin()
    const res = await c.post("/api/flows", {
      name: "",
      definition: { nodes: [httpNode("a", "/echo")], edges: [] },
      trigger: { type: "manual" },
    })
    expect(res.status).toBe(400)
  })

  it("rejects a cron trigger without an expression", async () => {
    const c = await admin()
    const res = await createRaw(
      c,
      { nodes: [httpNode("a", "/echo")], edges: [] },
      { trigger: { type: "cron" } },
    )
    expect(res.status).toBe(400)
  })

  it("rejects an invalid executor config (http without url)", async () => {
    const c = await admin()
    const res = await createRaw(c, {
      nodes: [{ id: "a", name: "a", executor: { type: "http", method: "GET" } }],
      edges: [],
    })
    expect(res.status).toBe(400)
  })
})
