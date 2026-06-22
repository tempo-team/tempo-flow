// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { toJson } from "@tempo-flow/shared-types"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { PrismaService } from "../prisma/prisma.service"
import type { RunLauncherService } from "../run/run-launcher.service"
import type { LockService } from "./lock.service"
import { SchedulerService } from "./scheduler.service"

function cronFlow(id: string, expr: string, overlapPolicy = "skip") {
  return { id, enabled: true, overlapPolicy, trigger: toJson({ type: "cron", expr }) }
}

function build(opts: { acquire?: boolean; activeRuns?: number }): {
  svc: SchedulerService
  launch: ReturnType<typeof vi.fn>
} {
  const count = vi.fn().mockResolvedValue(opts.activeRuns ?? 0)
  const launch = vi.fn().mockResolvedValue({ id: "run-1" })
  const prisma = {
    flow: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
    flowRun: { count },
  } as unknown as PrismaService
  const launcher = { launch } as unknown as RunLauncherService
  const lock = {
    acquire: vi.fn().mockResolvedValue(opts.acquire ?? true),
  } as unknown as LockService
  return { svc: new SchedulerService(prisma, launcher, lock), launch }
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
    const { svc, launch } = build({ acquire: false })
    await svc.trigger(cronFlow("f1", "*/5 * * * * *"))
    expect(launch).not.toHaveBeenCalled()
  })

  it("skips when a previous run is still active and overlap=skip", async () => {
    const { svc, launch } = build({ acquire: true, activeRuns: 1 })
    await svc.trigger(cronFlow("f1", "*/5 * * * * *", "skip"))
    expect(launch).not.toHaveBeenCalled()
  })

  it("launches a schedule run when free", async () => {
    const { svc, launch } = build({ acquire: true, activeRuns: 0 })
    await svc.trigger(cronFlow("f1", "*/5 * * * * *"))
    expect(launch).toHaveBeenCalledWith({ flowId: "f1", trigger: "schedule" })
  })

  it("allows overlap when policy=allow", async () => {
    const { svc, launch } = build({ acquire: true, activeRuns: 3 })
    await svc.trigger(cronFlow("f1", "*/5 * * * * *", "allow"))
    expect(launch).toHaveBeenCalledOnce()
  })
})
