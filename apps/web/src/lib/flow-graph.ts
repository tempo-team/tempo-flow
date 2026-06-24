// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { Edge, Node } from "@xyflow/react"
import dagre from "@dagrejs/dagre"
import type { EdgeCondition, FlowDefinition } from "@tempo-flow/shared-types"

export interface FlowNodeData extends Record<string, unknown> {
  label: string
  executor: string
  /** Run status for the run-status overlay (PENDING/RUNNING/SUCCESS/…); absent in the editor. */
  status?: string
}

// Edge colors map to the semantic palette (resolved as CSS vars in the themed app).
const EDGE_COLOR: Record<EdgeCondition, string> = {
  success: "var(--success)",
  failure: "var(--failed)",
  always: "var(--muted-foreground)",
}

/** Convert a stored FlowDefinition into React Flow nodes/edges (custom "tempo" node). */
export function toReactFlow(def: FlowDefinition): {
  nodes: Node<FlowNodeData>[]
  edges: Edge[]
} {
  const nodes: Node<FlowNodeData>[] = def.nodes.map((n) => ({
    id: n.id,
    type: "tempo",
    position: { x: 0, y: 0 },
    data: { label: n.name, executor: n.executor.type },
  }))
  const edges: Edge[] = def.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "smoothstep",
    label: e.on,
    style: { stroke: EDGE_COLOR[e.on], strokeWidth: 1.5 },
  }))
  return layout(nodes, edges)
}

/** Serialize React Flow nodes/edges back into a FlowDefinition (merging into base). */
export function fromReactFlow(
  base: FlowDefinition,
  nodes: Node<FlowNodeData>[],
  edges: Edge[],
): FlowDefinition {
  const byId = new Map(base.nodes.map((n) => [n.id, n]))
  return {
    nodes: nodes.map((n) => {
      const original = byId.get(n.id)
      return (
        original ?? {
          id: n.id,
          name: n.data.label,
          executor: { type: "http", url: "https://example.test/run", method: "POST" },
        }
      )
    }),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      on: (typeof e.label === "string" ? e.label : "success") as EdgeCondition,
    })),
  }
}

/** Auto-layout with dagre (left-to-right). */
export function layout(
  nodes: Node<FlowNodeData>[],
  edges: Edge[],
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: "LR", nodesep: 48, ranksep: 96 })
  const W = 208
  const H = 60
  for (const n of nodes) g.setNode(n.id, { width: W, height: H })
  for (const e of edges) g.setEdge(e.source, e.target)
  dagre.layout(g)
  return {
    nodes: nodes.map((n) => {
      const { x, y } = g.node(n.id)
      return { ...n, position: { x: x - W / 2, y: y - H / 2 } }
    }),
    edges,
  }
}
