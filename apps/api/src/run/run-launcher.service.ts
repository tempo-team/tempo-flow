// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from "@nestjs/common"
import { RunStatus, toJson } from "@tempo-flow/shared-types"
import { RunEventsService } from "../events/run-events.service"
import { PrismaService } from "../prisma/prisma.service"
import { QueueService } from "../queue/queue.service"

/** Where a run came from. Stored verbatim in FlowRun.trigger. */
export type RunTriggerSource = "manual" | "schedule" | "webhook" | "event" | "backfill" | "subflow"

export interface LaunchInput {
  flowId: string
  trigger: RunTriggerSource
  runDate?: string
  params?: Record<string, string>
  parentRunId?: string
}

/**
 * Single entry point for starting a flow run, regardless of trigger source
 * (manual, schedule, webhook, event, backfill). Creates the FlowRun, publishes
 * the initial status event, and enqueues it. Centralizing this keeps every
 * trigger consistent and is the hook point for pre-run approval (Phase 8).
 */
@Injectable()
export class RunLauncherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly events: RunEventsService,
  ) {}

  async launch(input: LaunchInput) {
    const meta = { runDate: input.runDate, params: input.params }

    // Interactive one-off triggers on an approval-gated flow wait for an
    // approver. Scheduled + backfill runs always execute (approving every cron
    // tick or backfill slice is not meaningful — those are operator actions).
    const interactive =
      input.trigger === "manual" || input.trigger === "webhook" || input.trigger === "event"
    const flow = await this.prisma.flow.findUnique({ where: { id: input.flowId } })
    const gated = interactive && flow?.requiresApproval === true

    const run = await this.prisma.flowRun.create({
      data: {
        flowId: input.flowId,
        status: gated ? RunStatus.PendingApproval : RunStatus.Pending,
        trigger: input.trigger,
        params: toJson(meta),
        ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
        ...(gated ? { approval: { create: {} } } : {}),
      },
    })
    await this.events.publish({
      kind: "run.status",
      flowRunId: run.id,
      flowId: input.flowId,
      status: run.status as RunStatus,
      at: new Date().toISOString(),
    })
    if (!gated) await this.queue.enqueueFlowRun({ flowRunId: run.id, flowId: input.flowId })
    return run
  }

  /** Approve a pending run: enqueue it for execution. */
  async approve(flowRunId: string, decidedBy: string, note?: string) {
    const run = await this.prisma.flowRun.findUnique({ where: { id: flowRunId } })
    if (!run || run.status !== RunStatus.PendingApproval) {
      throw new Error("Run is not awaiting approval")
    }
    await this.prisma.approvalRequest.update({
      where: { flowRunId },
      data: { status: "APPROVED", decidedBy, decidedAt: new Date(), note },
    })
    await this.prisma.flowRun.update({
      where: { id: flowRunId },
      data: { status: RunStatus.Pending },
    })
    await this.events.publish({
      kind: "run.status",
      flowRunId,
      flowId: run.flowId,
      status: RunStatus.Pending,
      at: new Date().toISOString(),
    })
    await this.queue.enqueueFlowRun({ flowRunId, flowId: run.flowId })
  }

  /** Reject a pending run: cancel it without executing. */
  async reject(flowRunId: string, decidedBy: string, note?: string) {
    const run = await this.prisma.flowRun.findUnique({ where: { id: flowRunId } })
    if (!run || run.status !== RunStatus.PendingApproval) {
      throw new Error("Run is not awaiting approval")
    }
    await this.prisma.approvalRequest.update({
      where: { flowRunId },
      data: { status: "REJECTED", decidedBy, decidedAt: new Date(), note },
    })
    await this.prisma.flowRun.update({
      where: { id: flowRunId },
      data: { status: RunStatus.Canceled, finishedAt: new Date() },
    })
    await this.events.publish({
      kind: "run.status",
      flowRunId,
      flowId: run.flowId,
      status: RunStatus.Canceled,
      at: new Date().toISOString(),
    })
  }
}
