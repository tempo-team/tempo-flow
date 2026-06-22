// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from "@nestjs/common"
import { RunStatus, toJson } from "@tempo-flow/shared-types"
import { RunEventsService } from "../events/run-events.service"
import { PrismaService } from "../prisma/prisma.service"
import { QueueService } from "../queue/queue.service"

/** Where a run came from. Stored verbatim in FlowRun.trigger. */
export type RunTriggerSource = "manual" | "schedule" | "webhook" | "event" | "backfill"

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
    const run = await this.prisma.flowRun.create({
      data: {
        flowId: input.flowId,
        status: RunStatus.Pending,
        trigger: input.trigger,
        params: toJson(meta),
      },
    })
    await this.events.publish({
      kind: "run.status",
      flowRunId: run.id,
      flowId: input.flowId,
      status: RunStatus.Pending,
      at: new Date().toISOString(),
    })
    await this.queue.enqueueFlowRun({ flowRunId: run.id, flowId: input.flowId })
    return run
  }
}
