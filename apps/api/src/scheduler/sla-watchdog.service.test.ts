// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { EventEmitter2 } from "@nestjs/event-emitter"
import { describe, expect, it, vi } from "vitest"
import type { RunEventsService } from "../events/run-events.service"
import { FLOW_RUN_FINISHED } from "../notification/notification.listener"
import type { PrismaService } from "../prisma/prisma.service"
import type { QueueService } from "../queue/queue.service"
import { SlaWatchdogService } from "./sla-watchdog.service"

function build(opts: {
  runs: unknown[]
  jobState?: string | null // null = no job (orphan)
  updateCount?: number
}) {
  const findMany = vi.fn().mockResolvedValue(opts.runs)
  const updateMany = vi.fn().mockResolvedValue({ count: opts.updateCount ?? 1 })
  // No suspended callback nodes by default (Phase 0 watchdog additions).
  const nodeFindMany = vi.fn().mockResolvedValue([])
  const nodeCount = vi.fn().mockResolvedValue(0)
  const prisma = {
    flowRun: { findMany, updateMany },
    nodeRun: { findMany: nodeFindMany, updateMany: vi.fn(), count: nodeCount },
  } as unknown as PrismaService
  const getJob = vi
    .fn()
    .mockResolvedValue(
      opts.jobState === null
        ? null
        : { getState: vi.fn().mockResolvedValue(opts.jobState ?? "failed") },
    )
  const enqueueResume = vi.fn().mockResolvedValue(undefined)
  const queue = { getQueue: () => ({ getJob }), enqueueResume } as unknown as QueueService
  const publish = vi.fn().mockResolvedValue(undefined)
  const runEvents = { publish } as unknown as RunEventsService
  const emit = vi.fn()
  const events = { emit } as unknown as EventEmitter2
  return {
    svc: new SlaWatchdogService(prisma, queue, runEvents, events),
    updateMany,
    emit,
    publish,
  }
}

const longAgo = new Date(Date.now() - 5 * 60_000)

describe("SlaWatchdogService.sweep", () => {
  it("fails a run that exceeded its flow SLA", async () => {
    const { svc, updateMany, emit } = build({
      runs: [{ id: "r1", flowId: "f1", startedAt: longAgo, flow: { name: "f", slaMs: 1000 } }],
    })
    await svc.sweep()
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "r1", status: "RUNNING" } }),
    )
    expect(emit).toHaveBeenCalledWith(
      FLOW_RUN_FINISHED,
      expect.objectContaining({ status: "FAILED" }),
    )
  })

  it("fails an orphaned run (no live BullMQ job) past the grace period", async () => {
    const { svc, updateMany } = build({
      runs: [{ id: "r1", flowId: "f1", startedAt: longAgo, flow: { name: "f", slaMs: null } }],
      jobState: null,
    })
    await svc.sweep()
    expect(updateMany).toHaveBeenCalled()
  })

  it("leaves a healthy run alone (active job, no SLA)", async () => {
    const { svc, updateMany } = build({
      runs: [{ id: "r1", flowId: "f1", startedAt: longAgo, flow: { name: "f", slaMs: null } }],
      jobState: "active",
    })
    await svc.sweep()
    expect(updateMany).not.toHaveBeenCalled()
  })

  it("does not emit when the conditional update finds nothing (already finalized)", async () => {
    const { svc, emit } = build({
      runs: [{ id: "r1", flowId: "f1", startedAt: longAgo, flow: { name: "f", slaMs: 1000 } }],
      updateCount: 0,
    })
    await svc.sweep()
    expect(emit).not.toHaveBeenCalled()
  })
})
