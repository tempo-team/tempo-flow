// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common"
import { EventEmitter2 } from "@nestjs/event-emitter"
import { RunStatus } from "@tempo-flow/shared-types"
import { RunEventsService } from "../events/run-events.service"
import { FLOW_RUN_FINISHED, type FlowRunFinishedEvent } from "../notification/notification.listener"
import { PrismaService } from "../prisma/prisma.service"
import { QueueService } from "../queue/queue.service"

const SWEEP_MS = 15_000
/** Don't flag a freshly-started run as stuck — give the worker time to claim it. */
const STUCK_GRACE_MS = 60_000
const LIVE_JOB_STATES = ["active", "waiting", "delayed", "waiting-children", "prioritized"]

/**
 * Periodically fails runs that overran their flow's SLA, or that are stuck in
 * RUNNING because their worker died (the BullMQ job is gone/failed but the run
 * was never finalized). Failing reuses the existing FAILED notification path.
 */
@Injectable()
export class SlaWatchdogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlaWatchdogService.name)
  private timer?: ReturnType<typeof setInterval>

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly runEvents: RunEventsService,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.sweep(), SWEEP_MS)
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  async sweep(): Promise<void> {
    try {
      const running = await this.prisma.flowRun.findMany({
        where: { status: RunStatus.Running },
        include: { flow: true },
      })
      const now = Date.now()
      for (const run of running) {
        if (!run.startedAt) continue

        // 1. Fail any callback nodes whose deadline passed, then resume the run
        //    so it can take a failure branch or finalize.
        await this.expireCallbacks(run.id, run.flowId, now)

        const elapsed = now - run.startedAt.getTime()
        if (run.flow.slaMs && elapsed > run.flow.slaMs) {
          await this.fail(run.id, run.flowId, run.flow.name, `SLA exceeded (${run.flow.slaMs}ms)`)
          continue
        }

        // 2. A run legitimately suspended on a callback has no live BullMQ job —
        //    do NOT treat it as orphaned. Its liveness is the callback deadline (step 1).
        const waiting = await this.prisma.nodeRun.count({
          where: { flowRunId: run.id, status: RunStatus.WaitingCallback },
        })
        if (waiting > 0) continue

        if (elapsed > STUCK_GRACE_MS && (await this.isOrphaned(run.id))) {
          await this.fail(run.id, run.flowId, run.flow.name, "worker lost (stuck run)")
        }
      }
    } catch (err) {
      this.logger.warn(`Watchdog sweep failed: ${(err as Error).message}`)
    }
  }

  /**
   * Fail callback nodes whose deadline elapsed (a never-returning external job),
   * then enqueue a resume so the engine advances the failure branch / finalizes.
   */
  private async expireCallbacks(flowRunId: string, flowId: string, now: number): Promise<void> {
    const expired = await this.prisma.nodeRun.findMany({
      where: {
        flowRunId,
        status: RunStatus.WaitingCallback,
        callbackDeadline: { lt: new Date(now) },
      },
      select: { id: true, nodeId: true, attempt: true },
    })
    let resumed = false
    for (const node of expired) {
      const res = await this.prisma.nodeRun.updateMany({
        where: { id: node.id, status: RunStatus.WaitingCallback },
        data: {
          status: RunStatus.Failed,
          errorMessage: "callback timed out",
          finishedAt: new Date(),
        },
      })
      if (res.count === 0) continue
      resumed = true
      this.logger.warn(`Node ${node.nodeId} (run ${flowRunId}) failed: callback timed out`)
      await this.runEvents.publish({
        kind: "node.status",
        flowRunId,
        nodeId: node.nodeId,
        nodeRunId: node.id,
        status: RunStatus.Failed,
        attempt: node.attempt,
        at: new Date().toISOString(),
        errorMessage: "callback timed out",
      })
    }
    if (resumed) await this.queue.enqueueResume(flowRunId, flowId)
  }

  /** A run whose BullMQ job is gone or no longer live is orphaned. */
  private async isOrphaned(flowRunId: string): Promise<boolean> {
    const job = await this.queue.getQueue().getJob(flowRunId)
    if (!job) return true
    const state = await job.getState()
    return !LIVE_JOB_STATES.includes(state)
  }

  private async fail(
    flowRunId: string,
    flowId: string,
    flowName: string,
    reason: string,
  ): Promise<void> {
    // Conditional update is the cross-instance dedup: only one sweep wins.
    const res = await this.prisma.flowRun.updateMany({
      where: { id: flowRunId, status: RunStatus.Running },
      data: { status: RunStatus.Failed, finishedAt: new Date() },
    })
    if (res.count === 0) return
    this.logger.warn(`Run ${flowRunId} failed by watchdog: ${reason}`)
    await this.runEvents.publish({
      kind: "run.status",
      flowRunId,
      flowId,
      status: RunStatus.Failed,
      at: new Date().toISOString(),
    })
    const event: FlowRunFinishedEvent = { flowName, flowRunId, status: RunStatus.Failed }
    this.events.emit(FLOW_RUN_FINISHED, event)
  }
}
