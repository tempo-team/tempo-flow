// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type {
  EdgeCondition,
  ExecutorConfig,
  FlowDefinition,
  FlowNode,
  FlowTrigger,
  OverlapPolicy,
} from "@tempo-flow/shared-types"

/** The full editable state for a flow (create or edit). */
export interface FlowEditorState {
  name: string
  description: string
  triggerType: FlowTrigger["type"]
  cronExpr: string
  enabled: boolean
  overlapPolicy: OverlapPolicy
  /** SLA in seconds (0 = none); converted to ms on save. */
  slaSeconds: number
  /** One-off runs (manual/webhook/event) wait for an approver before executing. */
  requiresApproval: boolean
  definition: FlowDefinition
}

export function emptyState(): FlowEditorState {
  return {
    name: "",
    description: "",
    triggerType: "manual",
    cronExpr: "*/5 * * * * *",
    enabled: true,
    overlapPolicy: "skip",
    slaSeconds: 0,
    requiresApproval: false,
    definition: { nodes: [], edges: [] },
  }
}

export function stateFromFlow(flow: {
  name: string
  description: string | null
  enabled: boolean
  trigger: FlowTrigger
  definition: FlowDefinition
  overlapPolicy?: string
  slaMs?: number | null
  requiresApproval?: boolean
}): FlowEditorState {
  return {
    name: flow.name,
    description: flow.description ?? "",
    triggerType: flow.trigger.type,
    cronExpr: flow.trigger.expr ?? "*/5 * * * * *",
    enabled: flow.enabled,
    overlapPolicy: (flow.overlapPolicy as OverlapPolicy) ?? "skip",
    slaSeconds: flow.slaMs ? Math.round(flow.slaMs / 1000) : 0,
    requiresApproval: flow.requiresApproval ?? false,
    definition: flow.definition,
  }
}

export function toTrigger(s: FlowEditorState): FlowTrigger {
  return s.triggerType === "cron" ? { type: "cron", expr: s.cronExpr } : { type: "manual" }
}

export function defaultHttpExecutor(): ExecutorConfig {
  return { type: "http", url: "https://example.test/run", method: "POST" }
}

export function defaultK8sExecutor(): ExecutorConfig {
  return { type: "k8s", image: "busybox:1.36" }
}

export function defaultSubflowExecutor(): ExecutorConfig {
  return { type: "subflow", flowId: "" }
}

/** A fresh node with a unique id within the definition. */
export function newNode(def: FlowDefinition): FlowNode {
  let n = def.nodes.length + 1
  let id = `node-${n}`
  const ids = new Set(def.nodes.map((node) => node.id))
  while (ids.has(id)) id = `node-${++n}`
  return { id, name: id, executor: defaultHttpExecutor() }
}

export function newEdge(source: string, target: string, on: EdgeCondition = "success") {
  return { id: `e-${crypto.randomUUID()}`, source, target, on }
}

/**
 * Replace a node and, if its id changed, remap every edge that referenced the
 * old id so edges never dangle.
 */
export function updateNodeInDef(
  def: FlowDefinition,
  oldId: string,
  next: FlowNode,
): FlowDefinition {
  const nodes = def.nodes.map((n) => (n.id === oldId ? next : n))
  if (next.id === oldId) return { ...def, nodes }
  const edges = def.edges.map((e) => ({
    ...e,
    source: e.source === oldId ? next.id : e.source,
    target: e.target === oldId ? next.id : e.target,
  }))
  return { nodes, edges }
}
