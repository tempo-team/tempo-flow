// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type Edge,
  type EdgeChange,
  MiniMap,
  type Node,
  type NodeChange,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { LayoutGrid, Plus } from "lucide-react"
import { useTheme } from "next-themes"
import type { EdgeCondition, FlowDefinition, FlowNode } from "@tempo-flow/shared-types"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { type FlowNodeData, layout, toReactFlow } from "@/lib/flow-graph"
import { flowNodeTypes } from "./FlowNode"
import { NodeForm } from "./NodeForm"
import { newEdge, newNode, updateNodeInDef } from "./state"

interface Props {
  definition: FlowDefinition
  onChange: (next: FlowDefinition) => void
}

const CONDITIONS: EdgeCondition[] = ["success", "failure", "always"]

/**
 * Visual DAG editor. Node positions live only on the canvas (the FlowDefinition
 * has no coordinates); structural edits (add/connect/delete) and node config
 * write back to the shared definition.
 */
export function CanvasMode({ definition, onChange }: Props) {
  const { resolvedTheme } = useTheme()
  const initial = useMemo(() => toReactFlow(definition), [])
  const [nodes, setNodes] = useState<Node<FlowNodeData>[]>(initial.nodes)
  const [edges, setEdges] = useState<Edge[]>(initial.edges)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  // Re-sync canvas when the definition's structure changes (e.g. from the form
  // tab or an Add-node click), preserving existing node positions.
  useEffect(() => {
    const next = toReactFlow(definition)
    setNodes((prev) => {
      const pos = new Map(prev.map((n) => [n.id, n.position]))
      return next.nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position }))
    })
    setEdges(next.edges)
  }, [definition])

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<FlowNodeData>>[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds))
      const removed = changes.filter((c) => c.type === "remove").map((c) => c.id)
      if (removed.length > 0) {
        onChange({
          nodes: definition.nodes.filter((n) => !removed.includes(n.id)),
          edges: definition.edges.filter(
            (e) => !removed.includes(e.source) && !removed.includes(e.target),
          ),
        })
      }
    },
    [definition, onChange],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds))
      const removed = changes.filter((c) => c.type === "remove").map((c) => c.id)
      if (removed.length > 0) {
        onChange({ ...definition, edges: definition.edges.filter((e) => !removed.includes(e.id)) })
      }
    },
    [definition, onChange],
  )

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return
      // Skip duplicates (same source → target on the same condition).
      const exists = definition.edges.some(
        (e) => e.source === conn.source && e.target === conn.target && e.on === "success",
      )
      if (exists) return
      const edge = newEdge(conn.source, conn.target, "success")
      setEdges((eds) => addEdge({ ...conn, id: edge.id, label: "success" }, eds))
      onChange({ ...definition, edges: [...definition.edges, edge] })
    },
    [definition, onChange],
  )

  function addNode(): void {
    onChange({ ...definition, nodes: [...definition.nodes, newNode(definition)] })
  }

  function autoLayout(): void {
    setNodes((nds) => layout(nds, edges).nodes)
  }

  const selected = definition.nodes.find((n) => n.id === selectedNode) ?? null

  function updateNode(next: FlowNode): void {
    if (!selectedNode) return
    onChange(updateNodeInDef(definition, selectedNode, next))
    if (next.id !== selectedNode) setSelectedNode(next.id)
  }

  function setEdgeCondition(edgeId: string, on: EdgeCondition): void {
    onChange({
      ...definition,
      edges: definition.edges.map((e) => (e.id === edgeId ? { ...e, on } : e)),
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={addNode}>
          <Plus className="mr-1 size-4" /> Add node
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={autoLayout}>
          <LayoutGrid className="mr-1 size-4" /> Auto layout
        </Button>
        <p className="text-xs text-muted-foreground">
          Drag to connect nodes. Click a node to edit it. Select + Delete to remove.
        </p>
      </div>

      <div className="h-[600px] overflow-hidden rounded-lg border bg-muted/20">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={flowNodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedNode(node.id)}
          colorMode={resolvedTheme === "dark" ? "dark" : "light"}
          proOptions={{ hideAttribution: true }}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <MiniMap pannable zoomable className="!bg-card" />
          <Controls className="!shadow-sm" />
        </ReactFlow>
      </div>

      {definition.edges.length > 0 && (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-xs font-medium text-muted-foreground">Edge conditions</p>
          {definition.edges.map((e) => (
            <div key={e.id} className="flex items-center gap-2 text-sm">
              <span className="font-mono text-xs">
                {e.source} → {e.target}
              </span>
              <Select
                value={e.on}
                onValueChange={(v) => setEdgeCondition(e.id, v as EdgeCondition)}
              >
                <SelectTrigger className="h-7 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelectedNode(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Edit node</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-8">
            {selected && <NodeForm node={selected} onChange={updateNode} />}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
