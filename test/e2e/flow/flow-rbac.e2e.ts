// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// RBAC matrix over the flow + run endpoints, exercised with real JWTs for each
// seeded role. Permissions (prisma/seed.ts):
//   admin    → all
//   operator → execute/view flow, execute/view/approve? (execute+view run)
//   approver → view flow/run, approve run
//   viewer   → view flow/run/history
// So: edit:flow (create/update/delete/import) = admin only; view:flow = everyone;
// execute:flow (run) = admin + operator.

import { beforeEach, describe, expect, it } from "vitest"
import { httpNode } from "../setup/builders"
import { type ApiClient, admin, clientForRoles } from "../setup/client"
import { waitForTerminal } from "../setup/wait"

const flowBody = {
  name: "rbac-flow",
  definition: { nodes: [httpNode("a", "/echo")], edges: [] },
  trigger: { type: "manual" },
}

describe("flow RBAC", () => {
  let operator: ApiClient
  let approver: ApiClient
  let viewer: ApiClient

  beforeEach(async () => {
    operator = await clientForRoles(["operator"])
    approver = await clientForRoles(["approver"])
    viewer = await clientForRoles(["viewer"])
  })

  it("only admin can create a flow (edit:flow)", async () => {
    const a = await admin()
    expect((await a.post("/api/flows", flowBody)).status).toBe(201)
    expect((await operator.post("/api/flows", flowBody)).status).toBe(403)
    expect((await approver.post("/api/flows", flowBody)).status).toBe(403)
    expect((await viewer.post("/api/flows", flowBody)).status).toBe(403)
  })

  it("every role can view flows (view:flow)", async () => {
    const a = await admin()
    const created = await a.post<{ id: string }>("/api/flows", flowBody)
    const id = created.body.id
    for (const client of [a, operator, approver, viewer]) {
      expect((await client.get("/api/flows")).status).toBe(200)
      expect((await client.get(`/api/flows/${id}`)).status).toBe(200)
    }
  })

  it("only admin + operator can execute a flow (execute:flow)", async () => {
    const a = await admin()
    const created = await a.post<{ id: string }>("/api/flows", flowBody)
    const id = created.body.id

    const adminRun = await a.post<{ id: string }>(`/api/flows/${id}/run`, {})
    const operatorRun = await operator.post<{ id: string }>(`/api/flows/${id}/run`, {})
    expect(adminRun.status).toBe(201)
    expect(operatorRun.status).toBe(201)
    expect((await approver.post(`/api/flows/${id}/run`, {})).status).toBe(403)
    expect((await viewer.post(`/api/flows/${id}/run`, {})).status).toBe(403)

    // Let the triggered runs finish before the test ends so per-test truncation
    // doesn't delete the flow out from under an in-flight worker.
    await waitForTerminal(adminRun.body.id)
    await waitForTerminal(operatorRun.body.id)
  })

  it("only admin can delete a flow (edit:flow)", async () => {
    const a = await admin()
    const created = await a.post<{ id: string }>("/api/flows", flowBody)
    const id = created.body.id
    expect((await viewer.del(`/api/flows/${id}`)).status).toBe(403)
    expect((await operator.del(`/api/flows/${id}`)).status).toBe(403)
    expect((await a.del(`/api/flows/${id}`)).status).toBe(204)
  })
})
