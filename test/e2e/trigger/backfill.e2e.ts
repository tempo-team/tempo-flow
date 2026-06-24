// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Backfill: POST /flows/:id/backfill creates one run per interval across a date
// range, each tagged trigger=backfill with its own runDate.

import { describe, expect, it } from "vitest"
import { createFlow, httpNode } from "../setup/builders"
import { admin } from "../setup/client"
import { type RunView, waitFor, waitForTerminal } from "../setup/wait"

describe("backfill trigger", () => {
  it("creates one run per day across the range", async () => {
    const c = await admin()
    const flow = await createFlow({ nodes: [httpNode("a", "/echo")] })

    const res = await c.post<{ count: number }>(`/api/flows/${flow.id}/backfill`, {
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-03T00:00:00.000Z",
      stepHours: 24,
    })
    expect(res.status).toBe(201)
    expect(res.body.count).toBe(3)

    // All three runs exist and are tagged backfill.
    const runs = await waitFor(
      async () => (await c.get<RunView[]>(`/api/flows/${flow.id}/runs`)).body,
      (rs) => rs.length === 3,
      { label: "3 backfill runs" },
    )
    expect(runs.every((r) => r.trigger === "backfill")).toBe(true)

    // Let them finish so per-test truncation doesn't race the worker.
    for (const r of runs) await waitForTerminal(r.id)
  })

  it("rejects an invalid date range (400)", async () => {
    const c = await admin()
    const flow = await createFlow({ nodes: [httpNode("a", "/echo")] })
    const res = await c.post(`/api/flows/${flow.id}/backfill`, {
      from: "2026-02-01T00:00:00.000Z",
      to: "2026-01-01T00:00:00.000Z",
    })
    expect(res.status).toBe(400)
  })
})
