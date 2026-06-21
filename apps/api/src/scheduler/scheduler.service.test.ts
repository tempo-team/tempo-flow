// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { toJson } from "@tempo-flow/shared-types"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { PrismaService } from "../prisma/prisma.service"
import type { QueueService } from "../queue/queue.service"
import type { LockService } from "./lock.service"
import { SchedulerService } from "./scheduler.service"

function cronFlow(id: string, expr: string, overlapPolicy = "skip") {
  return { id, enabled: true, overlapPolicy, trigger: toJson({ type: "cron", expr }) }
}

function build(opts: { acquire?: boolean; activeRuns?: number }): {
  svc: SchedulerService
  create: ReturnType<typeof vi.fn>
  enqueue: ReturnType<typeof vi.fn>
} {
  const create = vi.fn().mockResolvedValue({ id: "run-1" })
  const count = vi.fn().mockResolvedValue(opts.activeRuns ?? 0)
  const enqueue = vi.fn().mockResolvedValue(undefined)
  const prisma = {
    flow: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
    flowRun: { create, count },
  } as unknown as PrismaService
  const queue = { enqueueFlowRun: enqueue } as unknown as QueueService
  const lock = {
    acquire: vi.fn().mockResolvedValue(opts.acquire ?? true),
  } as unknown as LockService
  return { svc: new SchedulerService(prisma, queue, lock), create, enqueue }
}

describe("SchedulerService.register", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("registers a valid second-level cron flow", () => {
    const { svc } = build({})
    svc.register(cronFlow("f1", "*/5 * * * * *"))
    expect(svc.scheduledCount).toBe(1)
    svc.unregister("f1")
    expect(svc.scheduledCount).toBe(0)
  })

  it("ignores a manual (non-cron) flow", () => {
    const { svc } = build({})
    svc.register({
      id: "f2",
      enabled: true,
      overlapPolicy: "skip",
      trigger: toJson({ type: "manual" }),
    })
    expect(svc.scheduledCount).toBe(0)
  })

  it("does not register an invalid cron expression", () => {
    const { svc } = build({})
    svc.register(cronFlow("f3", "not-a-cron"))
    expect(svc.scheduledCount).toBe(0)
  })
})

describe("SchedulerService.trigger", () => {
  it("skips when the tick lock is not acquired (distributed dedup)", async () => {
    const { svc, create, enqueue } = build({ acquire: false })
    await svc.trigger(cronFlow("f1", "*/5 * * * * *"))
    expect(create).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
  })

  it("skips when a previous run is still active and overlap=skip", async () => {
    const { svc, create, enqueue } = build({ acquire: true, activeRuns: 1 })
    await svc.trigger(cronFlow("f1", "*/5 * * * * *", "skip"))
    expect(create).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
  })

  it("creates a run and enqueues when free", async () => {
    const { svc, create, enqueue } = build({ acquire: true, activeRuns: 0 })
    await svc.trigger(cronFlow("f1", "*/5 * * * * *"))
    expect(create).toHaveBeenCalledOnce()
    expect(enqueue).toHaveBeenCalledWith({ flowRunId: "run-1", flowId: "f1" })
  })

  it("allows overlap when policy=allow", async () => {
    const { svc, create } = build({ acquire: true, activeRuns: 3 })
    await svc.trigger(cronFlow("f1", "*/5 * * * * *", "allow"))
    expect(create).toHaveBeenCalledOnce()
  })
})
