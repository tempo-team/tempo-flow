// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest"
import type { PrismaService } from "../../prisma/prisma.service"
import type { RunLauncherService } from "../../run/run-launcher.service"
import type { EventMessageHandler } from "./event-adapter"
import { EventTriggerService, matchesFilter } from "./event-trigger.service"
import type { RedisStreamAdapter } from "./redis-stream.adapter"

describe("matchesFilter", () => {
  const fields = { region: "kr", env: "prod" }
  it("matches when there is no filter", () => {
    expect(matchesFilter(null, fields)).toBe(true)
  })
  it("matches when every filter key equals the field", () => {
    expect(matchesFilter(JSON.stringify({ region: "kr" }), fields)).toBe(true)
  })
  it("does not match when a filter value differs", () => {
    expect(matchesFilter(JSON.stringify({ region: "us" }), fields)).toBe(false)
  })
  it("does not match invalid filter JSON", () => {
    expect(matchesFilter("{not json", fields)).toBe(false)
  })
})

describe("EventTriggerService", () => {
  function build(triggers: unknown[]) {
    let captured: EventMessageHandler | undefined
    const findMany = vi.fn().mockResolvedValue(triggers)
    const launch = vi.fn().mockResolvedValue({ id: "run-1" })
    const prisma = {
      flowEventTrigger: { findMany },
      flow: { findUnique: vi.fn().mockResolvedValue({ id: "f1" }) },
    } as unknown as PrismaService
    const launcher = { launch } as unknown as RunLauncherService
    const adapter = {
      source: "redis",
      start: vi.fn(async (_topics: string[], handler: EventMessageHandler) => {
        captured = handler
      }),
      stop: vi.fn().mockResolvedValue(undefined),
    } as unknown as RedisStreamAdapter
    const svc = new EventTriggerService(prisma, launcher, adapter)
    return { svc, launch, adapter, handler: () => captured }
  }

  it("subscribes the adapter to enabled trigger topics on reload", async () => {
    const { svc, adapter } = build([
      { id: "t1", flowId: "f1", source: "redis", topic: "orders", enabled: true, filterJson: null },
    ])
    await svc.reload()
    expect(adapter.start).toHaveBeenCalledWith(["orders"], expect.any(Function))
  })

  it("launches an event run when a matching message arrives", async () => {
    const { svc, launch, handler } = build([
      { id: "t1", flowId: "f1", source: "redis", topic: "orders", enabled: true, filterJson: null },
    ])
    await svc.reload()
    handler()?.({ topic: "orders", fields: { id: "42" } })
    await Promise.resolve()
    expect(launch).toHaveBeenCalledWith({
      flowId: "f1",
      trigger: "event",
      params: { id: "42" },
    })
  })

  it("skips a message that fails the filter", async () => {
    const { svc, launch, handler } = build([
      {
        id: "t1",
        flowId: "f1",
        source: "redis",
        topic: "orders",
        enabled: true,
        filterJson: JSON.stringify({ region: "kr" }),
      },
    ])
    await svc.reload()
    handler()?.({ topic: "orders", fields: { region: "us" } })
    await Promise.resolve()
    expect(launch).not.toHaveBeenCalled()
  })
})
