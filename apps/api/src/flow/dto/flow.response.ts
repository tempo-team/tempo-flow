// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { type FlowDefinition, type FlowTrigger, fromJson } from "@tempo-flow/shared-types"

interface FlowRow {
  id: string
  name: string
  description: string | null
  definition: string
  trigger: string
  enabled: boolean
  overlapPolicy: string
  slaMs: number | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export class FlowResponse {
  id!: string
  name!: string
  description!: string | null
  definition!: FlowDefinition
  trigger!: FlowTrigger
  enabled!: boolean
  overlapPolicy!: string
  slaMs!: number | null
  createdBy!: string
  createdAt!: string
  updatedAt!: string

  static from(flow: FlowRow): FlowResponse {
    return {
      id: flow.id,
      name: flow.name,
      description: flow.description,
      definition: fromJson<FlowDefinition>(flow.definition, { nodes: [], edges: [] }),
      trigger: fromJson<FlowTrigger>(flow.trigger, { type: "manual" }),
      enabled: flow.enabled,
      overlapPolicy: flow.overlapPolicy,
      slaMs: flow.slaMs,
      createdBy: flow.createdBy,
      createdAt: flow.createdAt.toISOString(),
      updatedAt: flow.updatedAt.toISOString(),
    }
  }
}
