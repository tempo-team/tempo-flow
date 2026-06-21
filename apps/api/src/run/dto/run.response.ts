// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { fromJsonOpt } from "@tempo-flow/shared-types"

interface NodeRunRow {
  id: string
  nodeId: string
  status: string
  attempt: number
  executor: string
  request: string | null
  response: string | null
  errorMessage: string | null
  startedAt: Date | null
  finishedAt: Date | null
}

interface FlowRunRow {
  id: string
  flowId: string
  status: string
  trigger: string
  params: string | null
  startedAt: Date | null
  finishedAt: Date | null
  createdAt: Date
  nodeRuns?: NodeRunRow[]
}

export class NodeRunResponse {
  id!: string
  nodeId!: string
  status!: string
  attempt!: number
  executor!: string
  request!: unknown
  response!: unknown
  errorMessage!: string | null
  startedAt!: string | null
  finishedAt!: string | null

  static from(row: NodeRunRow): NodeRunResponse {
    return {
      id: row.id,
      nodeId: row.nodeId,
      status: row.status,
      attempt: row.attempt,
      executor: row.executor,
      request: fromJsonOpt(row.request) ?? null,
      response: fromJsonOpt(row.response) ?? null,
      errorMessage: row.errorMessage,
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
    }
  }
}

export class FlowRunResponse {
  id!: string
  flowId!: string
  status!: string
  trigger!: string
  startedAt!: string | null
  finishedAt!: string | null
  createdAt!: string
  nodeRuns?: NodeRunResponse[]

  static from(row: FlowRunRow): FlowRunResponse {
    return {
      id: row.id,
      flowId: row.flowId,
      status: row.status,
      trigger: row.trigger,
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      nodeRuns: row.nodeRuns?.map(NodeRunResponse.from),
    }
  }
}
