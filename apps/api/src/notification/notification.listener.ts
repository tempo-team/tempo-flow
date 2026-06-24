// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from "@nestjs/common"
import { OnEvent } from "@nestjs/event-emitter"
import { RunStatus } from "@tempo-flow/shared-types"
import { NotificationService } from "./notification.service"

export const FLOW_RUN_FINISHED = "flow.run.finished"

export interface FlowRunFinishedEvent {
  flowName: string
  flowRunId: string
  status: RunStatus
  /** Set when this run was launched as another run's child (sub-flow / agent tool). */
  parentRunId?: string | null
  /** How the run was triggered (e.g. "agent-tool" resumes its parent agent loop). */
  trigger?: string
}

@Injectable()
export class NotificationListener {
  constructor(private readonly notifications: NotificationService) {}

  @OnEvent(FLOW_RUN_FINISHED)
  async onFinished(event: FlowRunFinishedEvent): Promise<void> {
    const mapped =
      event.status === RunStatus.Failed
        ? "failed"
        : event.status === RunStatus.Success
          ? "completed"
          : null
    if (!mapped) return
    await this.notifications.notify({
      event: mapped,
      flowName: event.flowName,
      flowRunId: event.flowRunId,
      status: event.status,
    })
  }
}
