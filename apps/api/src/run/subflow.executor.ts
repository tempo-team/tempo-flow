// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { ExecResult, JobExecutor, RunContext } from "@tempo-flow/executors"
import {
  type FlowNode,
  RunStatus,
  type SubflowExecutorConfig,
  isTerminal,
} from "@tempo-flow/shared-types"
import type { PrismaService } from "../prisma/prisma.service"
import type { RunLauncherService } from "./run-launcher.service"

const POLL_INTERVAL_MS = 1000
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000 // 30 min ceiling when the node sets none

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Runs another flow as a single node: launches a child FlowRun (trigger
 * "subflow"), then polls until it reaches a terminal state. The node succeeds
 * iff the child run succeeds. A cycle guard walks the parentRunId ancestry so a
 * flow cannot (directly or transitively) invoke itself and spin forever.
 *
 * Lives in the API rather than @tempo-flow/executors because it depends on the
 * Nest-managed RunLauncherService and Prisma — it is constructed by hand in
 * RunService and registered into the engine's executor map under "subflow".
 */
export class SubflowExecutor implements JobExecutor {
  readonly type = "subflow" as const

  constructor(
    private readonly launcher: RunLauncherService,
    private readonly prisma: PrismaService,
  ) {}

  async execute(node: FlowNode, ctx: RunContext): Promise<ExecResult> {
    const cfg = node.executor as SubflowExecutorConfig
    const childFlowId = cfg.flowId

    const cycle = await this.findCycle(ctx.flowRunId, childFlowId)
    if (cycle) {
      return { ok: false, errorMessage: `Sub-flow cycle detected: ${cycle}` }
    }

    const child = await this.launcher.launch({
      flowId: childFlowId,
      trigger: "subflow",
      params: ctx.params,
      parentRunId: ctx.flowRunId,
    })
    ctx.onLog?.(`→ launched sub-flow run ${child.id} (flow ${childFlowId})`)

    const timeoutMs = node.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS)
      const run = await this.prisma.flowRun.findUnique({
        where: { id: child.id },
        select: { status: true },
      })
      if (!run) continue
      if (isTerminal(run.status as RunStatus)) {
        ctx.onLog?.(`← sub-flow run ${child.id} finished: ${run.status}`)
        const ok = run.status === RunStatus.Success
        return {
          ok,
          response: { childRunId: child.id, status: run.status },
          errorMessage: ok ? undefined : `Sub-flow ${childFlowId} ended ${run.status}`,
        }
      }
    }

    ctx.onLog?.(`✗ sub-flow run ${child.id} timed out after ${timeoutMs}ms`)
    return {
      ok: false,
      response: { childRunId: child.id },
      errorMessage: `Sub-flow ${childFlowId} timed out after ${timeoutMs}ms`,
    }
  }

  /**
   * Walk the parentRunId chain from the current run upward. If the child flow
   * we are about to launch already appears in the ancestry (including the
   * current run's own flow), launching it would recurse — return a readable
   * path describing the cycle. Bounded to avoid pathological chains.
   */
  private async findCycle(flowRunId: string, childFlowId: string): Promise<string | null> {
    const chain: string[] = []
    let cursor: string | null = flowRunId
    for (let depth = 0; cursor && depth < 50; depth++) {
      const run: { flowId: string; parentRunId: string | null } | null =
        await this.prisma.flowRun.findUnique({
          where: { id: cursor },
          select: { flowId: true, parentRunId: true },
        })
      if (!run) break
      chain.push(run.flowId)
      if (run.flowId === childFlowId) {
        return [...chain].reverse().concat(childFlowId).join(" → ")
      }
      cursor = run.parentRunId
    }
    return null
  }
}
