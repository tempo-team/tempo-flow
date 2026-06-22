// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { Edge, Node } from "@xyflow/react"
import dagre from "@dagrejs/dagre"
import type { EdgeCondition, FlowDefinition } from "@tempo-flow/shared-types"

export interface FlowNodeData extends Record<string, unknown> {
  label: string
  executor: string
}

const EDGE_COLOR: Record<EdgeCondition, string> = {
  success: "#16a34a",
  failure: "#dc2626",
  always: "#64748b",
}

/** Convert a stored FlowDefinition into React Flow nodes/edges. */
export function toReactFlow(def: FlowDefinition): {
  nodes: Node<FlowNodeData>[]
  edges: Edge[]
} {
  const nodes: Node<FlowNodeData>[] = def.nodes.map((n) => ({
    id: n.id,
    position: { x: 0, y: 0 },
    data: { label: n.name, executor: n.executor.type },
    // Theme-aware styling (Tailwind preflight resets React Flow's defaults, and
    // the dark theme would otherwise render white text on a white node).
    style: {
      background: "var(--card)",
      color: "var(--card-foreground)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
    },
  }))
  const edges: Edge[] = def.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.on,
    style: { stroke: EDGE_COLOR[e.on] },
    animated: e.on === "always",
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
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 80 })
  const W = 180
  const H = 48
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
