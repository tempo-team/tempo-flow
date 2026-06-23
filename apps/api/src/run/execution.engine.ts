// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { createHash, randomBytes } from "node:crypto"
import { type CompletionMode, type FlowDefinition, RunStatus } from "@tempo-flow/shared-types"
import { getNode, incomingEdges } from "@tempo-flow/flow-engine"
import type { ExecResult, JobExecutor, RunContext } from "@tempo-flow/executors"

export interface NodeRunRecord {
  id: string
}

/** A persisted node's state — drives the frontier computation on each advance. */
export interface NodeState {
  nodeId: string
  mapIndex: number
  status: RunStatus
}

/** Persistence hook for node runs — implemented over Prisma in the app, mocked in tests. */
export interface NodeRunRecorder {
  /** All NodeRun states for a run. The engine recomputes the frontier from these. */
  loadNodeStates(flowRunId: string): Promise<NodeState[]>
  /**
   * Claim a node for execution by inserting its NodeRun row. Returns the record,
   * or `null` if another advance already claimed it (unique-key conflict). This
   * claim is what makes node execution idempotent across concurrent advances.
   */
  claimNodeRun(input: {
    flowRunId: string
    nodeId: string
    mapIndex: number
    executor: string
    completionMode: CompletionMode
    callbackTokenHash?: string
    callbackDeadline?: Date
  }): Promise<NodeRunRecord | null>
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
  /** Emit a live log line for a node (best-effort, fire-and-forget). */
  nodeLog?(flowRunId: string, nodeId: string, line: string): void
}

export interface AdvanceArgs {
  flowRunId: string
  definition: FlowDefinition
  runDate: Date
  params?: Record<string, string>
  recorder: NodeRunRecorder
}

/** Outcome of one advance: either the run is terminal, or it is waiting on callbacks. */
export interface AdvanceResult {
  /** true → at least one node is WAITING_CALLBACK; the run stays RUNNING. */
  waiting: boolean
  /** Meaningful only when `waiting` is false. */
  status: RunStatus
}

export interface EngineOptions {
  /** Base URL for callback URLs handed to triggered jobs (e.g. https://host). */
  callbackBaseUrl?: string
  sleep?: (ms: number) => Promise<void>
  /** Overridable for deterministic tests. */
  genToken?: () => string
  now?: () => number
}

/** Default ceiling for a callback that never arrives (overridable per node). */
const DEFAULT_CALLBACK_TIMEOUT_MS = 30 * 60 * 1000

/**
 * Checkpoint-resume DAG engine. Rather than walking the whole DAG in one pass,
 * each `advance()` reads the persisted NodeRun states, computes the ready
 * frontier (not-yet-started nodes whose incoming edge has fired), executes them,
 * and stops. Sync nodes resolve immediately and unlock their successors in the
 * same advance; `callback` nodes only *trigger* external work and enter
 * WAITING_CALLBACK — their successors stay gated until the completion callback
 * resumes the run. This makes long external jobs not occupy a worker and lets a
 * run survive a worker restart (NodeRun rows are the source of truth).
 */
export class ExecutionEngine {
  private readonly sleep: (ms: number) => Promise<void>
  private readonly genToken: () => string
  private readonly now: () => number
  private readonly callbackBaseUrl: string

  constructor(
    private readonly executors: Record<string, JobExecutor>,
    opts: EngineOptions = {},
  ) {
    this.sleep = opts.sleep ?? defaultSleep
    this.genToken = opts.genToken ?? (() => randomBytes(24).toString("hex"))
    this.now = opts.now ?? (() => Date.now())
    this.callbackBaseUrl = (opts.callbackBaseUrl ?? "").replace(/\/$/, "")
  }

  async advance(args: AdvanceArgs): Promise<AdvanceResult> {
    const { definition, recorder } = args

    // Drive the frontier forward until nothing new is ready. Each iteration
    // re-reads DB so callbacks that landed mid-advance are picked up.
    for (;;) {
      const states = await recorder.loadNodeStates(args.flowRunId)
      const ready = this.computeReady(definition, states)
      if (ready.length === 0) break
      for (const nodeId of ready) await this.runNode(nodeId, args)
    }

    const states = await recorder.loadNodeStates(args.flowRunId)
    if (states.some((s) => s.status === RunStatus.WaitingCallback)) {
      return { waiting: true, status: RunStatus.Running }
    }
    const anyFailed = states.some((s) => s.status === RunStatus.Failed)
    return { waiting: false, status: anyFailed ? RunStatus.Failed : RunStatus.Success }
  }

  /**
   * Nodes with no NodeRun yet whose incoming edge has fired. An entry node (no
   * incoming edges) fires immediately. A downstream node fires when some
   * predecessor is terminal with an outcome matching the edge condition. A
   * predecessor that is still WAITING_CALLBACK gates its successors.
   */
  private computeReady(definition: FlowDefinition, states: NodeState[]): string[] {
    const started = new Set(states.map((s) => s.nodeId))
    const statusByNode = new Map(states.map((s) => [s.nodeId, s.status]))
    const ready: string[] = []

    for (const node of definition.nodes) {
      if (started.has(node.id)) continue
      const incoming = incomingEdges(definition, node.id)
      if (incoming.length === 0) {
        ready.push(node.id) // entry node
        continue
      }
      const fired = incoming.some((edge) => {
        const src = statusByNode.get(edge.source)
        if (src === RunStatus.Success) return edge.on === "success" || edge.on === "always"
        if (src === RunStatus.Failed) return edge.on === "failure" || edge.on === "always"
        return false
      })
      if (fired) ready.push(node.id)
    }
    return ready
  }

  private async runNode(nodeId: string, args: AdvanceArgs): Promise<void> {
    const { recorder } = args
    const node = getNode(args.definition, nodeId)
    if (!node) return

    const completionMode: CompletionMode = node.completion ?? "sync"
    let token: string | undefined
    let callback: RunContext["callback"]
    let callbackTokenHash: string | undefined
    let callbackDeadline: Date | undefined
    if (completionMode === "callback") {
      token = this.genToken()
      callbackTokenHash = sha256(token)
      const timeout = node.callbackTimeoutMs ?? node.timeoutMs ?? DEFAULT_CALLBACK_TIMEOUT_MS
      callbackDeadline = new Date(this.now() + timeout)
      callback = { token, url: `${this.callbackBaseUrl}/api/callbacks/${token}` }
    }

    const claimed = await recorder.claimNodeRun({
      flowRunId: args.flowRunId,
      nodeId,
      mapIndex: 0,
      executor: node.executor.type,
      completionMode,
      callbackTokenHash,
      callbackDeadline,
    })
    if (!claimed) return // another advance already claimed this node

    const ctx: RunContext = {
      flowRunId: args.flowRunId,
      nodeId,
      runDate: args.runDate,
      params: args.params,
      onLog: (line) => recorder.nodeLog?.(args.flowRunId, nodeId, line),
      callback,
    }
    const { result, attempt } = await this.executeWithRetry(node, ctx)

    if (completionMode === "callback" && result.ok) {
      // Trigger accepted — suspend until the external job reports completion.
      await recorder.updateNodeRun(claimed.id, {
        status: RunStatus.WaitingCallback,
        attempt,
        request: result.request,
        response: result.response,
      })
      return
    }

    await recorder.updateNodeRun(claimed.id, {
      status: result.ok ? RunStatus.Success : RunStatus.Failed,
      attempt,
      request: result.request,
      response: result.response,
      errorMessage: result.errorMessage,
    })
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

    // Always reduce a thrown error to a failed ExecResult so the node is
    // recorded FAILED and retry/branching proceed — a rejecting executor must
    // never escape to the queue processor and strand the run in RUNNING.
    const run = async (): Promise<ExecResult> => {
      try {
        return node.timeoutMs
          ? await withTimeout(executor.execute(node, ctx), node.timeoutMs)
          : await executor.execute(node, ctx)
      } catch (err) {
        return { ok: false, errorMessage: (err as Error).message }
      }
    }

    const max = node.retry?.max ?? 0
    let attempt = 0
    let result = await run()
    while (!result.ok && attempt < max) {
      attempt++
      await this.sleep(backoffDelayMs(node.retry, attempt))
      result = await run()
    }
    return { result, attempt }
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

/**
 * Bound how long we wait for an executor. The underlying work can't be hard-
 * canceled, but HTTP aborts itself and the K8s runner has its own deadline;
 * this is a safety net so a hung executor still fails the node.
 */
function withTimeout(promise: Promise<ExecResult>, ms: number): Promise<ExecResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(
      () => resolve({ ok: false, errorMessage: `timeout after ${ms}ms` }),
      ms,
    )
    promise.then(
      (r) => {
        clearTimeout(timer)
        resolve(r)
      },
      (err: Error) => {
        clearTimeout(timer)
        resolve({ ok: false, errorMessage: err.message })
      },
    )
  })
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
