// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger, NotFoundException } from "@nestjs/common"
import { EventEmitter2 } from "@nestjs/event-emitter"
import {
  DefaultK8sJobRunner,
  HttpExecutor,
  type JobExecutor,
  K8sExecutor,
} from "@tempo-flow/executors"
import {
  type FlowDefinition,
  RunStatus,
  fromJson,
  isTerminal,
  toJson,
} from "@tempo-flow/shared-types"
import { FLOW_RUN_FINISHED, type FlowRunFinishedEvent } from "../notification/notification.listener"
import { PrismaService } from "../prisma/prisma.service"
import { QueueService } from "../queue/queue.service"
import { ExecutionEngine, type NodeRunRecorder } from "./execution.engine"
import type { ManualRunRequest } from "./dto/run.request"

interface RunMeta {
  runDate?: string
  params?: Record<string, string>
}

@Injectable()
export class RunService implements NodeRunRecorder {
  private readonly logger = new Logger(RunService.name)
  private readonly engine: ExecutionEngine

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly events: EventEmitter2,
  ) {
    // K8s runner lazily loads kube config on first use, so constructing it here
    // does not require a cluster to be reachable at boot.
    const executors: Record<string, JobExecutor> = {
      http: new HttpExecutor(),
      k8s: new K8sExecutor(new DefaultK8sJobRunner()),
    }
    this.engine = new ExecutionEngine(executors)
  }

  listRuns(flowId: string) {
    return this.prisma.flowRun.findMany({
      where: { flowId },
      orderBy: { createdAt: "desc" },
    })
  }

  async getRun(id: string) {
    const run = await this.prisma.flowRun.findUnique({
      where: { id },
      include: { nodeRuns: true },
    })
    if (!run) throw new NotFoundException("Run not found")
    return run
  }

  /** Manually trigger a flow (optional backfill date + param overrides). */
  async manualRun(flowId: string, body: ManualRunRequest) {
    const flow = await this.prisma.flow.findUnique({ where: { id: flowId } })
    if (!flow) throw new NotFoundException("Flow not found")

    const meta: RunMeta = { runDate: body.runDate, params: body.params }
    const run = await this.prisma.flowRun.create({
      data: { flowId, status: RunStatus.Pending, trigger: "manual", params: toJson(meta) },
    })
    await this.queue.enqueueFlowRun({ flowRunId: run.id, flowId })
    return run
  }

  async cancel(id: string) {
    const run = await this.getRun(id)
    if (isTerminal(run.status as RunStatus)) return run
    return this.prisma.flowRun.update({
      where: { id },
      data: { status: RunStatus.Canceled, finishedAt: new Date() },
    })
  }

  /** Execute a queued run end-to-end (invoked by the BullMQ worker). */
  async executeRun(flowRunId: string): Promise<RunStatus> {
    const run = await this.prisma.flowRun.findUnique({
      where: { id: flowRunId },
      include: { flow: true },
    })
    if (!run) throw new NotFoundException("Run not found")
    if (isTerminal(run.status as RunStatus)) return run.status as RunStatus

    const definition = fromJson<FlowDefinition>(run.flow.definition, { nodes: [], edges: [] })
    const meta = fromJson<RunMeta>(run.params, {})
    const runDate = meta.runDate ? new Date(meta.runDate) : new Date()

    // Idempotent (re)start: a BullMQ retry after a mid-run crash re-enters here
    // with status still RUNNING. Clear any NodeRuns from the prior attempt so we
    // never accumulate duplicate rows.
    await this.prisma.nodeRun.deleteMany({ where: { flowRunId } })
    await this.prisma.flowRun.update({
      where: { id: flowRunId },
      data: { status: RunStatus.Running, startedAt: new Date() },
    })

    const status = await this.engine.runFlow({
      flowRunId,
      definition,
      runDate,
      params: meta.params,
      recorder: this,
    })

    // Only finalize if the run is still RUNNING — a concurrent cancel (which sets
    // CANCELED) must not be clobbered back to SUCCESS/FAILED.
    const finalized = await this.prisma.flowRun.updateMany({
      where: { id: flowRunId, status: RunStatus.Running },
      data: { status, finishedAt: new Date() },
    })
    if (finalized.count === 0) {
      this.logger.log(`Run ${flowRunId} was canceled during execution; result ${status} discarded`)
      return RunStatus.Canceled
    }
    this.logger.log(`Run ${flowRunId} finished: ${status}`)

    const event: FlowRunFinishedEvent = { flowName: run.flow.name, flowRunId, status }
    this.events.emit(FLOW_RUN_FINISHED, event)
    return status
  }

  // --- NodeRunRecorder (used by ExecutionEngine) --------------------------

  async createNodeRun(input: { flowRunId: string; nodeId: string; executor: string }) {
    const row = await this.prisma.nodeRun.create({
      data: {
        flowRunId: input.flowRunId,
        nodeId: input.nodeId,
        executor: input.executor,
        status: RunStatus.Running,
        startedAt: new Date(),
      },
    })
    return { id: row.id }
  }

  async updateNodeRun(
    id: string,
    patch: {
      status: RunStatus
      attempt: number
      request?: unknown
      response?: unknown
      errorMessage?: string
    },
  ): Promise<void> {
    await this.prisma.nodeRun.update({
      where: { id },
      data: {
        status: patch.status,
        attempt: patch.attempt,
        request: patch.request === undefined ? null : toJson(patch.request),
        response: patch.response === undefined ? null : toJson(patch.response),
        errorMessage: patch.errorMessage,
        finishedAt: new Date(),
      },
    })
  }
}
