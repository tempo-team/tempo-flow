// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Smoke test: proves the harness works end-to-end — the real API is up, login
// works, a flow can be created and read back, and per-test isolation truncates
// between tests (the same flow name is creatable twice).

import { describe, expect, it } from "vitest"
import { BASE_URL } from "./setup/config"
import { admin } from "./setup/client"
import { createFlow } from "./setup/builders"
import { httpNode } from "./setup/builders"

describe("smoke", () => {
  it("API is healthy", async () => {
    const res = await fetch(`${BASE_URL}/health`)
    expect(res.ok).toBe(true)
  })

  it("logs in as the seeded admin", async () => {
    const c = await admin()
    const me = await c.get<{ email: string; roles: string[] }>("/api/auth/me")
    expect(me.status).toBe(200)
    expect(me.body.email).toBe("admin@tempo-flow.local")
    expect(me.body.roles).toContain("admin")
  })

  it("creates a flow and reads it back", async () => {
    const c = await admin()
    const flow = await createFlow({ name: "smoke-flow", nodes: [httpNode("a", "/echo")] })
    expect(flow.id).toBeTruthy()

    const got = await c.get<{ id: string; name: string }>(`/api/flows/${flow.id}`)
    expect(got.status).toBe(200)
    expect(got.body.name).toBe("smoke-flow")

    const list = await c.get<unknown[]>("/api/flows")
    expect(list.status).toBe(200)
    expect(list.body.length).toBe(1)
  })

  it("isolates tests: the same flow name is creatable again", async () => {
    // Previous test created "smoke-flow"; truncation between tests means the
    // list is empty again and the name is free.
    const c = await admin()
    const list = await c.get<unknown[]>("/api/flows")
    expect(list.body.length).toBe(0)

    const flow = await createFlow({ name: "smoke-flow", nodes: [httpNode("a", "/echo")] })
    expect(flow.id).toBeTruthy()
  })
})
