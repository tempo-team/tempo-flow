// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { ExecutorType, FlowNode } from "@tempo-flow/shared-types"

/** Runtime context handed to an executor for a single node run. */
export interface RunContext {
  flowRunId: string
  /** The effective run date — substituted into date params. */
  runDate: Date
  /** Extra params merged on top of the node's resolved params (manual runs). */
  params?: Record<string, string>
}

/** Result of executing one node. */
export interface ExecResult {
  ok: boolean
  /** The actual request that was issued (recorded into NodeRun.request). */
  request?: unknown
  /** Response / exit code / log summary (recorded into NodeRun.response). */
  response?: unknown
  errorMessage?: string
}

/** A pluggable execution backend (HTTP, Kubernetes, ...). */
export interface JobExecutor {
  readonly type: ExecutorType
  execute(node: FlowNode, ctx: RunContext): Promise<ExecResult>
}
