// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Flow definition types — the "workflow-as-data" DAG that the web (React Flow)
 * renders and the execution engine interprets. Stored as JSON in Flow.definition.
 */

export type ExecutorType = "http" | "k8s" | "subflow" | "script" | "llm"

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

export type ScriptLanguage = "python" | "node" | "bash" | "go"

export interface ScriptExecutorConfig {
  type: "script"
  language: ScriptLanguage
  /** Inline source. Run in an isolated, per-execution container. */
  code: string
  /** Override the default base image for the language. */
  image?: string
  /** Allow the script container network access (default false — isolated). */
  network?: boolean
}

export type LlmProvider = "anthropic" | "openai" | "gemini"

export interface LlmExecutorConfig {
  type: "llm"
  /** Which model provider to call (default "anthropic"). */
  provider?: LlmProvider
  /** Model id; defaults to the provider's recommended model when omitted. */
  model?: string
  /** System prompt (supports `={{ }}` expressions). */
  system?: string
  /** User prompt (supports `={{ }}` expressions). */
  prompt: string
  maxTokens?: number
  effort?: "low" | "medium" | "high"
  /**
   * JSON Schema. When set, the model is forced to return matching JSON, which
   * becomes the node's output (consumable downstream as nodes.<id>.output).
   */
  outputSchema?: Record<string, unknown>
  /** Secret key holding the API key (defaults to the provider's standard name). */
  apiKeySecret?: string
}

export type ExecutorConfig =
  | HttpExecutorConfig
  | K8sExecutorConfig
  | SubflowExecutorConfig
  | ScriptExecutorConfig
  | LlmExecutorConfig

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

/** How successors fire after a fan-out node's instances all finish. */
export type JoinPolicy = "all" | "any" | "ratio"

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
  /**
   * Fan-out: a JSONata expression (over `{ runDate, params, nodes }`) that
   * evaluates to an array. One node instance runs per item, with `item` and
   * `mapIndex` available in param expressions (`={{ item.id }}`).
   */
  forEach?: string
  /** Max concurrent fan-out instances (default 5). */
  forEachConcurrency?: number
  /** When successors fire: all instances succeed (default), any, or a ratio. */
  join?: JoinPolicy
  /** Required success ratio (0..1) when `join` is "ratio". */
  joinRatio?: number
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
