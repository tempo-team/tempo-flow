// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { EventEmitter2 } from "@nestjs/event-emitter"
import { Prisma } from "@prisma/client"
import {
  DefaultK8sJobRunner,
  DockerScriptRunner,
  HttpExecutor,
  type JobExecutor,
  K8sExecutor,
  ScriptExecutor,
} from "@tempo-flow/executors"
import {
  type CompletionMode,
  type FlowDefinition,
  RunStatus,
  fromJson,
  isTerminal,
  toJson,
} from "@tempo-flow/shared-types"
import { RunEventsService } from "../events/run-events.service"
import { FLOW_RUN_FINISHED, type FlowRunFinishedEvent } from "../notification/notification.listener"
import { PrismaService } from "../prisma/prisma.service"
import { ExecutionEngine, type NodeRunRecorder } from "./execution.engine"
import { RunLauncherService } from "./run-launcher.service"
import { SubflowExecutor } from "./subflow.executor"
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
    private readonly launcher: RunLauncherService,
    private readonly events: EventEmitter2,
    private readonly runEvents: RunEventsService,
    private readonly config: ConfigService,
  ) {
    // K8s runner lazily loads kube config on first use, so constructing it here
    // does not require a cluster to be reachable at boot.
    const executors: Record<string, JobExecutor> = {
      http: new HttpExecutor(),
      k8s: new K8sExecutor(new DefaultK8sJobRunner()),
      subflow: new SubflowExecutor(this.launcher, this.prisma),
      // Inline scripts run as isolated one-shot Docker containers (DooD).
      script: new ScriptExecutor(
        new DockerScriptRunner(this.config.get<string>("DOCKER_PATH") ?? "docker"),
      ),
    }
    // Base URL handed to callback-mode jobs so they can report completion.
    const callbackBaseUrl = this.config.get<string>("PUBLIC_URL") ?? "http://localhost:3000"
    this.engine = new ExecutionEngine(executors, { callbackBaseUrl })
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
    return this.launcher.launch({
      flowId,
      trigger: "manual",
      runDate: body.runDate,
      params: body.params,
    })
  }

  /** Create a run per interval across a date range (trigger=backfill). */
  async backfill(
    flowId: string,
    input: { from: string; to: string; stepHours?: number },
  ): Promise<{ count: number }> {
    const flow = await this.prisma.flow.findUnique({ where: { id: flowId } })
    if (!flow) throw new NotFoundException("Flow not found")
    const start = new Date(input.from).getTime()
    const end = new Date(input.to).getTime()
    const step = Math.max(1, input.stepHours ?? 24) * 3_600_000
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
      throw new BadRequestException("Invalid date range")
    }
    const dates: Date[] = []
    for (let t = start; t <= end; t += step) dates.push(new Date(t))
    if (dates.length > 500) throw new BadRequestException("Backfill would create >500 runs")
    for (const d of dates) {
      await this.launcher.launch({ flowId, trigger: "backfill", runDate: d.toISOString() })
    }
    return { count: dates.length }
  }

  async cancel(id: string) {
    const run = await this.getRun(id)
    if (isTerminal(run.status as RunStatus)) return run
    const updated = await this.prisma.flowRun.update({
      where: { id },
      data: { status: RunStatus.Canceled, finishedAt: new Date() },
    })
    await this.runEvents.publish({
      kind: "run.status",
      flowRunId: id,
      flowId: updated.flowId,
      status: RunStatus.Canceled,
      at: new Date().toISOString(),
    })
    return updated
  }

  /**
   * Execute (or resume) a run. The BullMQ worker calls this for both the initial
   * `run` job (`resume=false`) and every `resume` job enqueued by a callback or
   * the SLA watchdog (`resume=true`). The engine advances the frontier as far as
   * it can; if any node is left WAITING_CALLBACK the run stays RUNNING and the
   * worker is released until the next signal.
   */
  async executeRun(flowRunId: string, resume = false): Promise<RunStatus> {
    const run = await this.prisma.flowRun.findUnique({
      where: { id: flowRunId },
      include: { flow: true },
    })
    if (!run) throw new NotFoundException("Run not found")
    if (isTerminal(run.status as RunStatus)) return run.status as RunStatus

    const definition = fromJson<FlowDefinition>(run.flow.definition, { nodes: [], edges: [] })
    const meta = fromJson<RunMeta>(run.params, {})
    const runDate = meta.runDate ? new Date(meta.runDate) : new Date()

    if (!resume) {
      // Fresh start (or idempotent BullMQ retry of a never-suspended run): clear
      // any NodeRuns from a prior attempt so we never accumulate duplicate rows.
      // A resume must NOT delete — the persisted NodeRuns ARE the checkpoint.
      await this.prisma.nodeRun.deleteMany({ where: { flowRunId } })
      await this.prisma.flowRun.update({
        where: { id: flowRunId },
        data: { status: RunStatus.Running, startedAt: new Date() },
      })
      await this.runEvents.publish({
        kind: "run.status",
        flowRunId,
        flowId: run.flowId,
        status: RunStatus.Running,
        at: new Date().toISOString(),
      })
    }

    const result = await this.engine.advance({
      flowRunId,
      definition,
      runDate,
      params: meta.params,
      recorder: this,
    })

    if (result.waiting) {
      this.logger.log(`Run ${flowRunId} suspended awaiting callback(s)`)
      return RunStatus.Running
    }

    // Only finalize if the run is still RUNNING — a concurrent cancel (which sets
    // CANCELED) must not be clobbered back to SUCCESS/FAILED.
    const finalized = await this.prisma.flowRun.updateMany({
      where: { id: flowRunId, status: RunStatus.Running },
      data: { status: result.status, finishedAt: new Date() },
    })
    if (finalized.count === 0) {
      this.logger.log(`Run ${flowRunId} no longer RUNNING; result ${result.status} discarded`)
      return run.status as RunStatus
    }
    this.logger.log(`Run ${flowRunId} finished: ${result.status}`)

    await this.runEvents.publish({
      kind: "run.status",
      flowRunId,
      flowId: run.flowId,
      status: result.status,
      at: new Date().toISOString(),
    })
    const event: FlowRunFinishedEvent = {
      flowName: run.flow.name,
      flowRunId,
      status: result.status,
    }
    this.events.emit(FLOW_RUN_FINISHED, event)
    return result.status
  }

  // --- NodeRunRecorder (used by ExecutionEngine) --------------------------

  loadNodeStates(flowRunId: string) {
    return this.prisma.nodeRun.findMany({
      where: { flowRunId },
      select: { nodeId: true, mapIndex: true, status: true },
    }) as Promise<{ nodeId: string; mapIndex: number; status: RunStatus }[]>
  }

  /**
   * Claim a node by inserting its NodeRun. The unique (flowRunId, nodeId,
   * mapIndex) key makes this the concurrency control: if a parallel advance
   * already claimed the node, the insert hits P2002 and we return null so the
   * caller skips it (no double execution).
   */
  async claimNodeRun(input: {
    flowRunId: string
    nodeId: string
    mapIndex: number
    executor: string
    completionMode: CompletionMode
    callbackTokenHash?: string
    callbackDeadline?: Date
  }): Promise<{ id: string } | null> {
    try {
      const row = await this.prisma.nodeRun.create({
        data: {
          flowRunId: input.flowRunId,
          nodeId: input.nodeId,
          mapIndex: input.mapIndex,
          executor: input.executor,
          completionMode: input.completionMode,
          callbackTokenHash: input.callbackTokenHash,
          callbackDeadline: input.callbackDeadline,
          status: RunStatus.Running,
          startedAt: new Date(),
        },
      })
      await this.runEvents.publish({
        kind: "node.status",
        flowRunId: input.flowRunId,
        nodeId: input.nodeId,
        nodeRunId: row.id,
        status: RunStatus.Running,
        attempt: 0,
        at: new Date().toISOString(),
      })
      return { id: row.id }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return null // already claimed by a concurrent advance
      }
      throw err
    }
  }

  /** Publish a live log line for a node (not persisted; surfaced via SSE). */
  nodeLog(flowRunId: string, nodeId: string, line: string): void {
    void this.runEvents.publish({
      kind: "node.log",
      flowRunId,
      nodeId,
      line,
      at: new Date().toISOString(),
    })
  }

  async updateNodeRun(
    id: string,
    patch: {
      status: RunStatus
      attempt: number
      request?: unknown
      response?: unknown
      output?: unknown
      errorMessage?: string
    },
  ): Promise<void> {
    const row = await this.prisma.nodeRun.update({
      where: { id },
      data: {
        status: patch.status,
        attempt: patch.attempt,
        request: patch.request === undefined ? null : toJson(patch.request),
        response: patch.response === undefined ? null : toJson(patch.response),
        output: patch.output === undefined ? undefined : toJson(patch.output),
        errorMessage: patch.errorMessage,
        // A node awaiting its callback is not finished yet.
        finishedAt: isTerminal(patch.status) ? new Date() : null,
      },
    })
    await this.runEvents.publish({
      kind: "node.status",
      flowRunId: row.flowRunId,
      nodeId: row.nodeId,
      nodeRunId: row.id,
      status: patch.status,
      attempt: patch.attempt,
      at: new Date().toISOString(),
      errorMessage: patch.errorMessage,
    })
  }
}
