// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Flow lifecycle: CRUD, versioning (update snapshots the pre-update state), and
// YAML export → import round-trip. Driven entirely through the HTTP API.

import { describe, expect, it } from "vitest"
import { httpNode } from "../setup/builders"
import { admin } from "../setup/client"

describe("flow lifecycle", () => {
  it("creates, reads, lists, updates (new version), and deletes a flow", async () => {
    const c = await admin()

    // create
    const created = await c.post<{ id: string; name: string }>("/api/flows", {
      name: "lifecycle",
      definition: { nodes: [httpNode("a", "/echo")], edges: [] },
      trigger: { type: "manual" },
    })
    expect(created.status).toBe(201)
    const id = created.body.id

    // get
    const got = await c.get<{ name: string; definition: { nodes: unknown[] } }>(`/api/flows/${id}`)
    expect(got.status).toBe(200)
    expect(got.body.name).toBe("lifecycle")
    expect(got.body.definition.nodes).toHaveLength(1)

    // list
    const list = await c.get<unknown[]>("/api/flows")
    expect(list.body).toHaveLength(1)

    // update: rename + add a node (snapshots the pre-update state as a version)
    const updated = await c.patch<{ name: string; definition: { nodes: unknown[] } }>(
      `/api/flows/${id}`,
      {
        name: "lifecycle-v2",
        definition: { nodes: [httpNode("a", "/echo"), httpNode("b", "/echo")], edges: [] },
      },
    )
    expect(updated.status).toBe(200)
    expect(updated.body.name).toBe("lifecycle-v2")
    expect(updated.body.definition.nodes).toHaveLength(2)

    // versions: one snapshot holding the original (pre-update) name
    const versions = await c.get<Array<{ version: number; name: string }>>(
      `/api/flows/${id}/versions`,
    )
    expect(versions.status).toBe(200)
    expect(versions.body.length).toBeGreaterThanOrEqual(1)
    expect(versions.body.some((v) => v.name === "lifecycle")).toBe(true)

    // delete → gone
    const del = await c.del(`/api/flows/${id}`)
    expect(del.status).toBe(204)
    const after = await c.get(`/api/flows/${id}`)
    expect(after.status).toBe(404)
  })

  it("restores a previous version", async () => {
    const c = await admin()
    const created = await c.post<{ id: string }>("/api/flows", {
      name: "orig",
      definition: { nodes: [httpNode("a", "/echo")], edges: [] },
      trigger: { type: "manual" },
    })
    const id = created.body.id

    await c.patch(`/api/flows/${id}`, { name: "changed" })
    const versions = await c.get<Array<{ version: number; name: string }>>(
      `/api/flows/${id}/versions`,
    )
    const origVersion = versions.body.find((v) => v.name === "orig")
    expect(origVersion).toBeTruthy()

    const restored = await c.post<{ name: string }>(
      `/api/flows/${id}/versions/${origVersion!.version}/restore`,
    )
    expect(restored.status).toBe(201)
    expect(restored.body.name).toBe("orig")
  })

  it("exports a flow to YAML and re-imports an equivalent flow", async () => {
    const c = await admin()
    const created = await c.post<{ id: string }>("/api/flows", {
      name: "exportme",
      definition: { nodes: [httpNode("a", "/echo"), httpNode("b", "/echo")], edges: [] },
      trigger: { type: "manual" },
    })
    const id = created.body.id

    const exported = await c.get<string>(`/api/flows/${id}/export`)
    expect(exported.status).toBe(200)
    expect(typeof exported.body).toBe("string")
    expect(exported.body).toContain("name: exportme")

    const imported = await c.post<{ id: string; name: string; definition: { nodes: unknown[] } }>(
      "/api/flows/import",
      { yaml: exported.body },
    )
    expect(imported.status).toBe(201)
    expect(imported.body.id).not.toBe(id)
    expect(imported.body.name).toBe("exportme")
    expect(imported.body.definition.nodes).toHaveLength(2)
  })
})
