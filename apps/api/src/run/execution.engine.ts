// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { createHash, randomBytes } from "node:crypto"
import { SpanStatusCode, context as otelContext, propagation, trace } from "@opentelemetry/api"
import {
  type CompletionMode,
  type FlowDefinition,
  type FlowNode,
  RunStatus,
} from "@tempo-flow/shared-types"
import { getNode, incomingEdges } from "@tempo-flow/flow-engine"
import {
  type ExecResult,
  type JobExecutor,
  type RunContext,
  evaluateExpression,
} from "@tempo-flow/executors"
import { maskValues } from "../common/mask"

export interface NodeRunRecord {
  id: string
}

/** A persisted node's state — drives the frontier computation on each advance. */
export interface NodeState {
  nodeId: string
  mapIndex: number
  status: RunStatus
}

/** A persisted node-instance output (callback- or executor-produced). */
export interface NodeOutput {
  nodeId: string
  mapIndex: number
  output: unknown
}

/** Persistence hook for node runs — implemented over Prisma in the app, mocked in tests. */
export interface NodeRunRecorder {
  /** All NodeRun states for a run. The engine recomputes the frontier from these. */
  loadNodeStates(flowRunId: string): Promise<NodeState[]>
  /** Raw per-instance outputs (the engine aggregates them per node definition). */
  loadNodeOutputs(flowRunId: string): Promise<NodeOutput[]>
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
      output?: unknown
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
  /** Decrypted secrets injected into executions; masked out of recorded requests. */
  secrets?: Record<string, string>
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
/** Default max concurrent fan-out instances. */
const DEFAULT_FOREACH_CONCURRENCY = 5
/** Bound `forEach` JSONata evaluation so a bad expression can't hang advance. */
const FOREACH_EVAL_TIMEOUT_MS = 5000

/** Reject if `p` does not settle within `ms` (the underlying work isn't canceled). */
function raceWithTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ])
}

// No-op when OTel is not configured (getTracer returns a no-op tracer).
const tracer = trace.getTracer("tempo-flow")

/**
 * Build the `nodes` context for expressions: a fan-out node (has `forEach`)
 * exposes the array of its instance outputs ordered by mapIndex; a normal node
 * exposes its single output.
 */
function buildNodeOutputs(definition: FlowDefinition, raw: NodeOutput[]): Record<string, unknown> {
  const byNode = new Map<string, NodeOutput[]>()
  for (const o of raw) {
    const list = byNode.get(o.nodeId)
    if (list) list.push(o)
    else byNode.set(o.nodeId, [o])
  }
  const result: Record<string, unknown> = {}
  for (const [nodeId, list] of byNode) {
    list.sort((a, b) => a.mapIndex - b.mapIndex)
    const node = getNode(definition, nodeId)
    const output = node?.forEach ? list.map((o) => o.output) : list[0]?.output
    // Exposed as nodes.<id>.output so expressions read `nodes.fetch.output.ids`.
    result[nodeId] = { output }
  }
  return result
}

function groupByNode(states: NodeState[]): Map<string, NodeState[]> {
  const map = new Map<string, NodeState[]>()
  for (const s of states) {
    const list = map.get(s.nodeId)
    if (list) list.push(s)
    else map.set(s.nodeId, [s])
  }
  return map
}

/**
 * A node's single status across its (possibly fan-out) instances:
 * - no instances → undefined (not started)
 * - any instance still RUNNING/WAITING → undefined (in progress; gates successors)
 * - all terminal → Success/Failed per the node's join policy (all|any|ratio).
 */
function aggregateStatus(
  node: FlowNode | undefined,
  instances: NodeState[],
): RunStatus | undefined {
  if (instances.length === 0) return undefined
  const inProgress = instances.some(
    (s) => s.status === RunStatus.Running || s.status === RunStatus.WaitingCallback,
  )
  if (inProgress) return undefined

  const total = instances.length
  const succ = instances.filter((s) => s.status === RunStatus.Success).length
  const join = node?.join ?? "all"
  const ok =
    join === "any"
      ? succ >= 1
      : join === "ratio"
        ? succ / total >= (node?.joinRatio ?? 1)
        : succ === total
  return ok ? RunStatus.Success : RunStatus.Failed
}

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
      const nodeOutputs = buildNodeOutputs(
        definition,
        await recorder.loadNodeOutputs(args.flowRunId),
      )
      for (const nodeId of ready) await this.runNode(nodeId, args, nodeOutputs)
    }

    const states = await recorder.loadNodeStates(args.flowRunId)
    if (states.some((s) => s.status === RunStatus.WaitingCallback)) {
      return { waiting: true, status: RunStatus.Running }
    }
    // Run-level outcome: failed if any node's aggregate status is Failed.
    const anyFailed = [...groupByNode(states)].some(
      ([nodeId, insts]) => aggregateStatus(getNode(definition, nodeId), insts) === RunStatus.Failed,
    )
    return { waiting: false, status: anyFailed ? RunStatus.Failed : RunStatus.Success }
  }

  /**
   * Nodes with no NodeRun yet whose incoming edge has fired. An entry node (no
   * incoming edges) fires immediately. A downstream node fires when a
   * predecessor's *aggregate* status (across all fan-out instances, per its join
   * policy) matches the edge condition. A predecessor still WAITING/running gates
   * its successors.
   */
  private computeReady(definition: FlowDefinition, states: NodeState[]): string[] {
    const byNode = groupByNode(states)
    const ready: string[] = []

    for (const node of definition.nodes) {
      if (byNode.has(node.id)) continue // already started
      const incoming = incomingEdges(definition, node.id)
      if (incoming.length === 0) {
        ready.push(node.id) // entry node
        continue
      }
      const fired = incoming.some((edge) => {
        const agg = aggregateStatus(getNode(definition, edge.source), byNode.get(edge.source) ?? [])
        if (agg === RunStatus.Success) return edge.on === "success" || edge.on === "always"
        if (agg === RunStatus.Failed) return edge.on === "failure" || edge.on === "always"
        return false
      })
      if (fired) ready.push(node.id)
    }
    return ready
  }

  /** Run a node: a single instance, or fan it out into one instance per item. */
  private async runNode(
    nodeId: string,
    args: AdvanceArgs,
    nodeOutputs: Record<string, unknown>,
  ): Promise<void> {
    const node = getNode(args.definition, nodeId)
    if (!node) return

    if (!node.forEach) {
      await this.runInstance(node, 0, undefined, args, nodeOutputs)
      return
    }

    // Fan-out: evaluate the array, then run one instance per item. Bounded by a
    // timeout so a pathological expression can't hang the worker's advance.
    let items: unknown
    try {
      items = await raceWithTimeout(
        evaluateExpression(node.forEach, {
          runDate: args.runDate,
          params: args.params,
          nodes: nodeOutputs,
          secrets: args.secrets,
        }),
        FOREACH_EVAL_TIMEOUT_MS,
        "forEach expression",
      )
    } catch (err) {
      await this.recordSentinel(
        node,
        args,
        RunStatus.Failed,
        `forEach failed: ${(err as Error).message}`,
      )
      return
    }
    const arr = Array.isArray(items) ? items : items == null ? [] : [items]
    if (arr.length === 0) {
      // Vacuous success — mark the node done so successors can fire.
      await this.recordSentinel(node, args, RunStatus.Success, undefined, [])
      return
    }

    const limit = Math.max(1, node.forEachConcurrency ?? DEFAULT_FOREACH_CONCURRENCY)
    for (let i = 0; i < arr.length; i += limit) {
      await Promise.all(
        arr
          .slice(i, i + limit)
          .map((item, j) => this.runInstance(node, i + j, item, args, nodeOutputs)),
      )
    }
  }

  /** Claim + execute one node instance (mapIndex within a fan-out, or 0). */
  private async runInstance(
    node: FlowNode,
    mapIndex: number,
    item: unknown,
    args: AdvanceArgs,
    nodeOutputs: Record<string, unknown>,
  ): Promise<void> {
    const { recorder } = args
    const completionMode: CompletionMode = node.completion ?? "sync"
    let callback: RunContext["callback"]
    let callbackTokenHash: string | undefined
    let callbackDeadline: Date | undefined
    if (completionMode === "callback") {
      const token = this.genToken()
      callbackTokenHash = sha256(token)
      const timeout = node.callbackTimeoutMs ?? node.timeoutMs ?? DEFAULT_CALLBACK_TIMEOUT_MS
      callbackDeadline = new Date(this.now() + timeout)
      callback = { token, url: `${this.callbackBaseUrl}/api/callbacks/${token}` }
    }

    const claimed = await recorder.claimNodeRun({
      flowRunId: args.flowRunId,
      nodeId: node.id,
      mapIndex,
      executor: node.executor.type,
      completionMode,
      callbackTokenHash,
      callbackDeadline,
    })
    if (!claimed) return // another advance already claimed this instance

    // One span per node instance; the job inherits its trace via `traceparent`.
    await tracer.startActiveSpan(`node.run ${node.id}`, async (span) => {
      span.setAttributes({
        "tempo.flow_run_id": args.flowRunId,
        "tempo.node_id": node.id,
        "tempo.executor": node.executor.type,
        "tempo.map_index": mapIndex,
        "tempo.completion": completionMode,
      })
      const carrier: Record<string, string> = {}
      propagation.inject(otelContext.active(), carrier)

      const ctx: RunContext = {
        flowRunId: args.flowRunId,
        nodeId: node.id,
        runDate: args.runDate,
        params: args.params,
        secrets: args.secrets,
        item,
        mapIndex,
        nodeOutputs,
        traceparent: carrier.traceparent,
        onLog: (line) => recorder.nodeLog?.(args.flowRunId, node.id, line),
        callback,
      }
      const { result, attempt } = await this.executeWithRetry(node, ctx)
      // Never persist plaintext: mask secret values AND the one-time callback
      // token (which appears in the request headers/params/URL) out of what we
      // store. Output is masked too so a script that echoes a secret can't leak it.
      const sensitive = [...Object.values(args.secrets ?? {}), callback?.token]
      const request = maskValues(result.request, sensitive)
      const response = maskValues(result.response, sensitive)

      if (completionMode === "callback" && result.ok) {
        // Trigger accepted — suspend until the external job reports completion.
        span.setAttribute("tempo.waiting_callback", true)
        await recorder.updateNodeRun(claimed.id, {
          status: RunStatus.WaitingCallback,
          attempt,
          request,
          response,
        })
        span.end()
        return
      }

      span.setStatus({ code: result.ok ? SpanStatusCode.OK : SpanStatusCode.ERROR })
      if (!result.ok && result.errorMessage) span.recordException(new Error(result.errorMessage))
      await recorder.updateNodeRun(claimed.id, {
        status: result.ok ? RunStatus.Success : RunStatus.Failed,
        attempt,
        request,
        response,
        output: maskValues(result.output, sensitive),
        errorMessage: result.errorMessage,
      })
      span.end()
    })
  }

  /** Mark a fan-out node done without running items (empty array / eval error). */
  private async recordSentinel(
    node: FlowNode,
    args: AdvanceArgs,
    status: RunStatus,
    errorMessage?: string,
    output?: unknown,
  ): Promise<void> {
    const claimed = await args.recorder.claimNodeRun({
      flowRunId: args.flowRunId,
      nodeId: node.id,
      mapIndex: 0,
      executor: node.executor.type,
      completionMode: "sync",
    })
    if (!claimed) return
    await args.recorder.updateNodeRun(claimed.id, { status, attempt: 0, output, errorMessage })
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
