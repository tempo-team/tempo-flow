// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Flow definition types — the "workflow-as-data" DAG that the web (React Flow)
 * renders and the execution engine interprets. Stored as JSON in Flow.definition.
 */

export type ExecutorType = "http" | "k8s"

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

export type ExecutorConfig = HttpExecutorConfig | K8sExecutorConfig

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

export interface FlowNode {
  id: string
  name: string
  executor: ExecutorConfig
  params?: NodeParams
  retry?: RetryPolicy
  timeoutMs?: number
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
