// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { RunEvent } from "@tempo-flow/shared-types"
import type { Redis } from "ioredis"
import { describe, expect, it, vi } from "vitest"
import { RunEventsService } from "./run-events.service"

const event: RunEvent = {
  kind: "run.status",
  flowRunId: "run-1",
  flowId: "f1",
  status: "RUNNING",
  at: "2026-06-22T00:00:00.000Z",
}

describe("RunEventsService", () => {
  it("publishes to the run-scoped channel as JSON", async () => {
    const publish = vi.fn().mockResolvedValue(1)
    const redis = { publish } as unknown as Redis
    const svc = new RunEventsService(redis)

    await svc.publish(event)

    expect(publish).toHaveBeenCalledWith("tf:run:run-1", JSON.stringify(event))
  })

  it("swallows publish errors so a run is never broken by the event bus", async () => {
    const redis = {
      publish: vi.fn().mockRejectedValue(new Error("redis down")),
    } as unknown as Redis
    const svc = new RunEventsService(redis)
    await expect(svc.publish(event)).resolves.toBeUndefined()
  })

  it("fans a received message out to per-run and global listeners", async () => {
    // Fake subscriber connection that captures the pmessage handler.
    let handler: ((p: string, c: string, payload: string) => void) | undefined
    const subscriber = {
      on: vi.fn((_e: string, cb: typeof handler) => {
        handler = cb
      }),
      psubscribe: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
    }
    const redis = {
      publish: vi.fn(),
      duplicate: vi.fn(() => subscriber),
    } as unknown as Redis
    const svc = new RunEventsService(redis)

    const perRun = vi.fn()
    const global = vi.fn()
    svc.subscribe("run-1", perRun)
    svc.subscribe("*", global)
    await Promise.resolve() // let ensureSubscriber's psubscribe settle

    handler?.("tf:run:*", "tf:run:run-1", JSON.stringify(event))
    expect(perRun).toHaveBeenCalledWith(event)
    expect(global).toHaveBeenCalledWith(event)

    // Event for a different run reaches global but not the run-1 listener.
    perRun.mockClear()
    handler?.("tf:run:*", "tf:run:run-2", JSON.stringify({ ...event, flowRunId: "run-2" }))
    expect(perRun).not.toHaveBeenCalled()
    expect(global).toHaveBeenCalledTimes(2)
  })

  it("unsubscribe removes the listener", async () => {
    const subscriber = {
      on: vi.fn(),
      psubscribe: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn(),
    }
    const redis = { publish: vi.fn(), duplicate: vi.fn(() => subscriber) } as unknown as Redis
    const svc = new RunEventsService(redis)
    const cb = vi.fn()
    const off = svc.subscribe("run-1", cb)
    off()
    // No direct observable; just assert no throw and idempotent off.
    expect(() => off()).not.toThrow()
  })
})
