// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Real-time run events, published by workers over Redis pub/sub and relayed to
 * the web over SSE. Shared by API and web so both sides agree on the shape.
 */

import type { RunStatus } from "./run-status.js"

export type RunEventKind = "run.status" | "node.status" | "node.log"

/** A flow run changed status (PENDING → RUNNING → SUCCESS/FAILED/...). */
export interface RunStatusEvent {
  kind: "run.status"
  flowRunId: string
  flowId: string
  status: RunStatus
  /** ISO timestamp. */
  at: string
}

/** A node within a run changed status. */
export interface NodeStatusEvent {
  kind: "node.status"
  flowRunId: string
  nodeId: string
  nodeRunId: string
  status: RunStatus
  attempt: number
  at: string
  errorMessage?: string
}

/** A line of log output from a running node (e.g. a K8s pod). */
export interface NodeLogEvent {
  kind: "node.log"
  flowRunId: string
  nodeId: string
  line: string
  at: string
}

export type RunEvent = RunStatusEvent | NodeStatusEvent | NodeLogEvent
