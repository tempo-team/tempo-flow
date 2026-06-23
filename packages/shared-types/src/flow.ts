// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Flow definition types — the "workflow-as-data" DAG that the web (React Flow)
 * renders and the execution engine interprets. Stored as JSON in Flow.definition.
 */

export type ExecutorType = "http" | "k8s" | "subflow"

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export interface HttpExecutorConfig {
  type: "http"
  url: string
  method: HttpMethod
  headers?: Record<string, string>
  /** Where resolved params go: query string (default) or JSON body. */
  paramsIn?: "query" | "body"
}

export interface K8sExecutorConfig {
  type: "k8s"
  image: string
  command?: string[]
  args?: string[]
  namespace?: string
  /** Inject resolved params as env vars (default) or appended args. */
  paramsAs?: "env" | "args"
}

export interface SubflowExecutorConfig {
  type: "subflow"
  /** The child flow to launch and wait on. */
  flowId: string
}

export type ExecutorConfig = HttpExecutorConfig | K8sExecutorConfig | SubflowExecutorConfig

/** Reservation-date parameter: `key` = `expr` formatted with `format`. */
export interface DateParam {
  key: string
  /** Template expr, e.g. "${RUN_DATE}", "${RUN_DATE-7d}", "${YYYYMM}". */
  expr: string
  /** date-fns format string, e.g. "yyyyMMdd". */
  format: string
}

export interface NodeParams {
  static?: Record<string, string>
  dateParams?: DateParam[]
}

export type BackoffStrategy = "fixed" | "exponential"

export interface RetryPolicy {
  max: number
  backoff: BackoffStrategy
  delayMs: number
}

/**
 * How a node's success/failure is determined.
 * - `sync` (default): the executor's immediate result decides it (HTTP 2xx, exit 0).
 * - `callback`: the executor only *triggers* the work; the node stays in
 *   WAITING_CALLBACK until the external app reports completion to the callback
 *   API. Downstream nodes do not run until that signal arrives.
 */
export type CompletionMode = "sync" | "callback"

export interface FlowNode {
  id: string
  name: string
  executor: ExecutorConfig
  params?: NodeParams
  retry?: RetryPolicy
  timeoutMs?: number
  /** Completion model for this node (default "sync"). */
  completion?: CompletionMode
  /** callback mode: ms to wait for the callback before failing the node. */
  callbackTimeoutMs?: number
}

export type EdgeCondition = "success" | "failure" | "always"

export interface FlowEdge {
  id: string
  source: string
  target: string
  on: EdgeCondition
}

export interface FlowDefinition {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export type FlowTriggerType = "cron" | "manual"

export interface FlowTrigger {
  type: FlowTriggerType
  /** 6-field (second-level) cron expression when type === "cron". */
  expr?: string
}

export type OverlapPolicy = "skip" | "allow"
