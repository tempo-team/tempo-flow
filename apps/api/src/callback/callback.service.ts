// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto"
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common"
import { type FlowDefinition, RunStatus, fromJson, toJson } from "@tempo-flow/shared-types"
import { maskValues } from "../common/mask"
import { RunEventsService } from "../events/run-events.service"
import { PrismaService } from "../prisma/prisma.service"
import { QueueService } from "../queue/queue.service"
import { SecretService } from "../secret/secret.service"
import type { CallbackReportRequest } from "./dto/callback.request"

const DEFAULT_CALLBACK_TIMEOUT_MS = 30 * 60 * 1000

/**
 * Handles async-completion callbacks from external batch jobs. A node running in
 * `callback` mode is suspended (WAITING_CALLBACK) with a one-time token; when the
 * job finishes it POSTs its result here. We transition the node, then enqueue a
 * resume tick so the engine advances the now-unlocked successors. Everything is
 * idempotent: a duplicate or late callback on an already-terminal node is a no-op.
 */
@Injectable()
export class CallbackService {
  private readonly logger = new Logger(CallbackService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly runEvents: RunEventsService,
    private readonly queue: QueueService,
    private readonly secrets: SecretService,
  ) {}

  async report(token: string, body: CallbackReportRequest): Promise<{ ok: true }> {
    const node = await this.findByToken(token)
    if (!node) throw new NotFoundException("Unknown or expired callback token")

    // Idempotent: already resolved (duplicate callback, or watchdog timed it out).
    if (node.status !== RunStatus.WaitingCallback) return { ok: true }

    const status = body.status === "success" ? RunStatus.Success : RunStatus.Failed
    // Scrub any secret value the job echoed back in its output before persisting
    // (only loads/decrypts secrets when there's actually output to mask).
    let output: string | null = null
    if (body.output !== undefined) {
      const secrets = await this.secrets.resolveForFlow(node.flowRun.flowId)
      output = toJson(maskValues(body.output, Object.values(secrets)))
    }
    // Conditional update = the race guard: only one callback/timeout wins.
    const res = await this.prisma.nodeRun.updateMany({
      where: { id: node.id, status: RunStatus.WaitingCallback },
      data: {
        status,
        output,
        errorMessage: body.errorMessage,
        finishedAt: new Date(),
      },
    })
    if (res.count === 0) return { ok: true } // lost the race; already handled

    await this.runEvents.publish({
      kind: "node.status",
      flowRunId: node.flowRunId,
      nodeId: node.nodeId,
      nodeRunId: node.id,
      status,
      attempt: node.attempt,
      at: new Date().toISOString(),
      errorMessage: body.errorMessage,
    })
    this.logger.log(`Callback ${status} for node ${node.nodeId} (run ${node.flowRunId})`)
    await this.queue.enqueueResume(node.flowRunId, node.flowRun.flowId)
    return { ok: true }
  }

  /** Extend a waiting node's deadline so a long-running job is not timed out. */
  async heartbeat(token: string): Promise<{ ok: true; deadline: string }> {
    const node = await this.findByToken(token)
    if (!node) throw new NotFoundException("Unknown or expired callback token")
    if (node.status !== RunStatus.WaitingCallback) {
      throw new BadRequestException("Node is not awaiting a callback")
    }
    const def = fromJson<FlowDefinition>(node.flowRun.flow.definition, { nodes: [], edges: [] })
    const flowNode = def.nodes.find((n) => n.id === node.nodeId)
    const window = flowNode?.callbackTimeoutMs ?? flowNode?.timeoutMs ?? DEFAULT_CALLBACK_TIMEOUT_MS
    const deadline = new Date(Date.now() + window)
    await this.prisma.nodeRun.update({
      where: { id: node.id },
      data: { callbackDeadline: deadline },
    })
    return { ok: true, deadline: deadline.toISOString() }
  }

  /** Lightweight status probe so a job can detect it was canceled/expired. */
  async status(token: string): Promise<{ status: RunStatus }> {
    const node = await this.findByToken(token)
    if (!node) throw new NotFoundException("Unknown or expired callback token")
    return { status: node.status as RunStatus }
  }

  private findByToken(token: string) {
    return this.prisma.nodeRun.findUnique({
      where: { callbackTokenHash: sha256(token) },
      include: { flowRun: { include: { flow: true } } },
    })
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}
