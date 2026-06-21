// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto"
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common"
import { type FlowTrigger, RunStatus, fromJson } from "@tempo-flow/shared-types"
import { Cron } from "croner"
import { PrismaService } from "../prisma/prisma.service"
import { QueueService } from "../queue/queue.service"
import { LockService } from "./lock.service"

interface SchedulableFlow {
  id: string
  trigger: string
  enabled: boolean
  overlapPolicy: string
}

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name)
  private readonly jobs = new Map<string, Cron>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly lock: LockService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.registerAll()
  }

  async registerAll(): Promise<void> {
    const flows = await this.prisma.flow.findMany({ where: { enabled: true } })
    for (const flow of flows) this.register(flow)
    this.logger.log(`Registered ${this.jobs.size} scheduled flow(s)`)
  }

  /** (Re)register a single flow's cron job. No-op for non-cron/disabled flows. */
  register(flow: SchedulableFlow): void {
    this.unregister(flow.id)
    if (!flow.enabled) return
    const trigger = fromJson<FlowTrigger>(flow.trigger, { type: "manual" })
    if (trigger.type !== "cron" || !trigger.expr) return

    try {
      // Croner auto-detects the optional 6th (seconds) field → second-level cron.
      const job = new Cron(trigger.expr, () => void this.trigger(flow))
      this.jobs.set(flow.id, job)
    } catch (err) {
      this.logger.error(`Invalid cron for flow ${flow.id}: ${(err as Error).message}`)
    }
  }

  unregister(flowId: string): void {
    const job = this.jobs.get(flowId)
    if (job) {
      job.stop()
      this.jobs.delete(flowId)
    }
  }

  /** Re-load a flow and (re)schedule it after a create/update. */
  async reschedule(flowId: string): Promise<void> {
    const flow = await this.prisma.flow.findUnique({ where: { id: flowId } })
    if (flow) this.register(flow)
    else this.unregister(flowId)
  }

  /**
   * Fire a scheduled flow: dedupe the tick across instances with a Redis lock,
   * enforce the overlap policy, create a FlowRun, and enqueue it.
   */
  async trigger(flow: SchedulableFlow): Promise<void> {
    const tickBucket = Math.floor(Date.now() / 1000)
    const lockName = `flow-tick:${flow.id}:${tickBucket}`
    const acquired = await this.lock.acquire(lockName, randomUUID(), 2000)
    if (!acquired) return // another instance already handled this tick

    if (flow.overlapPolicy === "skip") {
      const active = await this.prisma.flowRun.count({
        where: { flowId: flow.id, status: { in: [RunStatus.Pending, RunStatus.Running] } },
      })
      if (active > 0) {
        this.logger.warn(`Skipping flow ${flow.id}: previous run still active (overlap=skip)`)
        return
      }
    }

    const run = await this.prisma.flowRun.create({
      data: { flowId: flow.id, status: RunStatus.Pending, trigger: "schedule" },
    })
    await this.queue.enqueueFlowRun({ flowRunId: run.id, flowId: flow.id })
    this.logger.log(`Enqueued flow ${flow.id} run ${run.id}`)
  }

  /** Number of currently registered cron jobs (for diagnostics/tests). */
  get scheduledCount(): number {
    return this.jobs.size
  }
}
