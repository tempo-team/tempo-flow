// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Cron trigger (second-level): an enabled cron flow fires automatically; the
// overlap policy bounds concurrency; and the scheduler's Redis tick lock
// deduplicates a tick across multiple instances.
//
// Cleanup: the long-lived API keeps cron jobs in memory, so each test disables
// its flow (→ scheduler.unregister) and drains in-flight runs before returning,
// so per-test truncation never races a still-registered cron.

import { afterEach, describe, expect, it } from "vitest"
import { spawnInstance } from "../setup/app-process"
import { createFlow, httpNode } from "../setup/builders"
import { admin } from "../setup/client"
import { type RunView, waitFor } from "../setup/wait"

const ACTIVE = ["PENDING", "RUNNING", "WAITING_CALLBACK"]
const everySecond = { type: "cron", expr: "* * * * * *" }

const createdFlows: string[] = []

async function runsFor(flowId: string): Promise<RunView[]> {
  const c = await admin()
  return (await c.get<RunView[]>(`/api/flows/${flowId}/runs`)).body
}

/** Disable the flow (unregisters its cron) and wait for in-flight runs to settle. */
async function disableAndDrain(flowId: string): Promise<void> {
  const c = await admin()
  await c.patch(`/api/flows/${flowId}`, { enabled: false })
  await waitFor(
    () => runsFor(flowId),
    (rs) => rs.every((r) => !ACTIVE.includes(r.status)),
    { timeout: 20_000, label: "cron runs drained" },
  ).catch(() => undefined)
}

afterEach(async () => {
  for (const id of createdFlows.splice(0)) await disableAndDrain(id)
})

async function cronFlow(opts: {
  overlapPolicy?: "skip" | "allow"
  path?: string
}): Promise<string> {
  const flow = await createFlow({
    nodes: [httpNode("a", opts.path ?? "/echo")],
    trigger: everySecond,
    enabled: true,
    overlapPolicy: opts.overlapPolicy,
  })
  createdFlows.push(flow.id)
  return flow.id
}

/** Sample the active-run count repeatedly and return the max observed. */
async function maxActiveOver(flowId: string, durationMs: number): Promise<number> {
  const end = Date.now() + durationMs
  let max = 0
  while (Date.now() < end) {
    const active = (await runsFor(flowId)).filter((r) => ACTIVE.includes(r.status)).length
    max = Math.max(max, active)
    await new Promise((r) => setTimeout(r, 150))
  }
  return max
}

describe("cron trigger", () => {
  it("fires automatically on schedule", async () => {
    const flowId = await cronFlow({})
    const runs = await waitFor(
      () => runsFor(flowId),
      (rs) => rs.length >= 1,
      {
        timeout: 10_000,
        label: "cron auto-fire",
      },
    )
    expect(runs[0].trigger).toBe("schedule")
  })

  it("overlap=skip never runs two instances of the same flow at once", async () => {
    const flowId = await cronFlow({ overlapPolicy: "skip", path: "/slow/1500" })
    const max = await maxActiveOver(flowId, 4000)
    expect(max).toBe(1)
  })

  it("overlap=allow lets runs overlap", async () => {
    const flowId = await cronFlow({ overlapPolicy: "allow", path: "/slow/1500" })
    const max = await maxActiveOver(flowId, 4000)
    expect(max).toBeGreaterThanOrEqual(2)
  })

  it("dedupes a tick across two instances (Redis tick lock)", async () => {
    // Create first so both schedulers register it (the secondary at boot).
    const flowId = await cronFlow({ overlapPolicy: "allow", path: "/echo" })
    const secondary = await spawnInstance(13701)
    try {
      const runs = await waitFor(
        () => runsFor(flowId),
        (rs) => rs.length >= 4,
        {
          timeout: 12_000,
          label: "ticks across 2 instances",
        },
      )
      // With the lock, each 1-second tick bucket yields exactly one run despite
      // two schedulers firing it. Without dedup, some buckets would have two.
      const buckets = new Map<number, number>()
      for (const r of runs) {
        const sec = Math.floor(new Date(r.createdAt).getTime() / 1000)
        buckets.set(sec, (buckets.get(sec) ?? 0) + 1)
      }
      expect([...buckets.values()].every((n) => n === 1)).toBe(true)
    } finally {
      await secondary.stop()
    }
  })
})
