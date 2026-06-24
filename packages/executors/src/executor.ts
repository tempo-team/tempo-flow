// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { ExecutorType, FlowNode } from "@tempo-flow/shared-types"

/** Callback coordinates for a node running in async-completion mode. */
export interface CallbackContext {
  /** Full URL the external job POSTs its result to. */
  url: string
  /** Opaque one-time token (also embedded in the URL). */
  token: string
}

/** Runtime context handed to an executor for a single node run. */
export interface RunContext {
  flowRunId: string
  nodeId: string
  /** The effective run date — substituted into date params. */
  runDate: Date
  /** Extra params merged on top of the node's resolved params (manual runs). */
  params?: Record<string, string>
  /** Emit a live log line for this node (streamed to the UI). Best-effort. */
  onLog?: (line: string) => void
  /**
   * Present when the node runs in `callback` completion mode. The executor must
   * hand these to the triggered job (env/headers/body) so it can report back.
   */
  callback?: CallbackContext
  /** Current fan-out item (set for fan-out node instances; `item` in exprs). */
  item?: unknown
  /** This instance's fan-out index (0 for non-fan-out nodes). */
  mapIndex?: number
  /** Upstream node outputs by node id, for `nodes.<id>.output` expressions. */
  nodeOutputs?: Record<string, unknown>
  /** Decrypted secrets for `={{ secrets.KEY }}` and script env injection. */
  secrets?: Record<string, string>
  /** W3C trace context to hand to the job so its spans join this trace. */
  traceparent?: string
  /** Run-level guardrails the sub-flow / agent-tool launchers enforce before launching. */
  guardrails?: {
    maxSubflowDepth?: number
    allowedToolFlows?: string[]
  }
}

/** Result of executing one node. */
export interface ExecResult {
  ok: boolean
  /** The actual request that was issued (recorded into NodeRun.request). */
  request?: unknown
  /** Response / exit code / log summary (recorded into NodeRun.response). */
  response?: unknown
  /** Structured result for downstream consumption (recorded into NodeRun.output). */
  output?: unknown
  errorMessage?: string
  /**
   * The executor triggered external work and wants the node SUSPENDED rather
   * than finalized: the engine moves it to WAITING_CALLBACK (successors gate, the
   * worker is released) until something resumes the run. Used by the durable
   * agent loop, which suspends while its tool sub-flows run. Honored only when
   * `ok` is true; ignored on failure.
   */
  suspend?: boolean
}

/** A pluggable execution backend (HTTP, Kubernetes, ...). */
export interface JobExecutor {
  readonly type: ExecutorType
  execute(node: FlowNode, ctx: RunContext): Promise<ExecResult>
}
