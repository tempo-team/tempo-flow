// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { type FlowDefinition, RunStatus } from "@tempo-flow/shared-types"
import { entryNodes, getNode, outgoingTargets } from "@tempo-flow/flow-engine"
import type { ExecResult, JobExecutor, RunContext } from "@tempo-flow/executors"

export interface NodeRunRecord {
  id: string
}

/** Persistence hook for node runs — implemented over Prisma in the app, mocked in tests. */
export interface NodeRunRecorder {
  createNodeRun(input: {
    flowRunId: string
    nodeId: string
    executor: string
  }): Promise<NodeRunRecord>
  updateNodeRun(
    id: string,
    patch: {
      status: RunStatus
      attempt: number
      request?: unknown
      response?: unknown
      errorMessage?: string
    },
  ): Promise<void>
}

export interface RunFlowArgs {
  flowRunId: string
  definition: FlowDefinition
  runDate: Date
  params?: Record<string, string>
  recorder: NodeRunRecorder
}

/**
 * Interprets a DAG: starts from entry nodes, executes each node with its
 * retry/backoff policy, records the NodeRun, then follows outgoing edges whose
 * condition matches the outcome (success/failure/always) — giving multiple
 * successors (fan-out) and conditional branching. A node runs at most once.
 */
export class ExecutionEngine {
  constructor(
    private readonly executors: Record<string, JobExecutor>,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
  ) {}

  async runFlow(args: RunFlowArgs): Promise<RunStatus> {
    const { definition, recorder } = args
    const visited = new Set<string>()
    const queue = entryNodes(definition)
    let anyFailed = false

    while (queue.length > 0) {
      const nodeId = queue.shift() as string
      if (visited.has(nodeId)) continue
      visited.add(nodeId)

      const node = getNode(definition, nodeId)
      if (!node) continue

      const nodeRun = await recorder.createNodeRun({
        flowRunId: args.flowRunId,
        nodeId,
        executor: node.executor.type,
      })

      const ctx: RunContext = {
        flowRunId: args.flowRunId,
        runDate: args.runDate,
        params: args.params,
      }
      const { result, attempt } = await this.executeWithRetry(node, ctx)

      await recorder.updateNodeRun(nodeRun.id, {
        status: result.ok ? RunStatus.Success : RunStatus.Failed,
        attempt,
        request: result.request,
        response: result.response,
        errorMessage: result.errorMessage,
      })

      const outcome = result.ok ? "success" : "failure"
      if (!result.ok) anyFailed = true
      for (const target of outgoingTargets(definition, nodeId, outcome)) queue.push(target)
    }

    return anyFailed ? RunStatus.Failed : RunStatus.Success
  }

  private async executeWithRetry(
    node: Parameters<JobExecutor["execute"]>[0],
    ctx: RunContext,
  ): Promise<{ result: ExecResult; attempt: number }> {
    const executor = this.executors[node.executor.type]
    if (!executor) {
      return {
        result: { ok: false, errorMessage: `No executor registered for "${node.executor.type}"` },
        attempt: 0,
      }
    }

    const max = node.retry?.max ?? 0
    let attempt = 0
    let result = await executor.execute(node, ctx)
    while (!result.ok && attempt < max) {
      attempt++
      await this.sleep(backoffDelayMs(node.retry, attempt))
      result = await executor.execute(node, ctx)
    }
    return { result, attempt }
  }
}

function backoffDelayMs(
  retry: { backoff: "fixed" | "exponential"; delayMs: number } | undefined,
  attempt: number,
): number {
  if (!retry) return 0
  return retry.backoff === "exponential" ? retry.delayMs * 2 ** (attempt - 1) : retry.delayMs
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
