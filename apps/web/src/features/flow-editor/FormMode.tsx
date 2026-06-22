// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Plus, Trash2 } from "lucide-react"
import type { EdgeCondition, FlowDefinition, FlowNode } from "@tempo-flow/shared-types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { NodeForm } from "./NodeForm"
import { newEdge, newNode, updateNodeInDef } from "./state"

interface Props {
  definition: FlowDefinition
  onChange: (next: FlowDefinition) => void
}

const CONDITIONS: EdgeCondition[] = ["success", "failure", "always"]

export function FormMode({ definition, onChange }: Props) {
  function setNode(index: number, next: FlowNode): void {
    onChange(updateNodeInDef(definition, definition.nodes[index].id, next))
  }
  function addNode(): void {
    onChange({ ...definition, nodes: [...definition.nodes, newNode(definition)] })
  }
  function removeNode(id: string): void {
    onChange({
      nodes: definition.nodes.filter((n) => n.id !== id),
      edges: definition.edges.filter((e) => e.source !== id && e.target !== id),
    })
  }

  function addEdge(): void {
    if (definition.nodes.length < 1) return
    const [a, b] = [definition.nodes[0].id, definition.nodes[1]?.id ?? definition.nodes[0].id]
    onChange({ ...definition, edges: [...definition.edges, newEdge(a, b)] })
  }
  function patchEdge(id: string, p: Partial<FlowDefinition["edges"][number]>): void {
    onChange({
      ...definition,
      edges: definition.edges.map((e) => (e.id === id ? { ...e, ...p } : e)),
    })
  }
  function removeEdge(id: string): void {
    onChange({ ...definition, edges: definition.edges.filter((e) => e.id !== id) })
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Nodes ({definition.nodes.length})</h3>
          <Button type="button" size="sm" variant="outline" onClick={addNode}>
            <Plus className="mr-1 size-4" /> Add node
          </Button>
        </div>
        {definition.nodes.length === 0 && (
          <p className="text-sm text-muted-foreground">No nodes yet. Add the first step.</p>
        )}
        {definition.nodes.map((node, i) => (
          <Card key={node.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
              <CardTitle className="text-sm">{node.name || node.id}</CardTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => removeNode(node.id)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </CardHeader>
            <CardContent>
              <NodeForm node={node} onChange={(next) => setNode(i, next)} />
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Edges ({definition.edges.length})</h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addEdge}
            disabled={definition.nodes.length < 1}
          >
            <Plus className="mr-1 size-4" /> Add edge
          </Button>
        </div>
        {definition.edges.map((edge) => (
          <div key={edge.id} className="flex items-center gap-2">
            <NodeSelect
              value={edge.source}
              nodes={definition.nodes}
              onChange={(v) => patchEdge(edge.id, { source: v })}
            />
            <Select
              value={edge.on}
              onValueChange={(v) => patchEdge(edge.id, { on: v as EdgeCondition })}
            >
              <SelectTrigger className="h-8 w-32">
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
            <span className="text-muted-foreground">→</span>
            <NodeSelect
              value={edge.target}
              nodes={definition.nodes}
              onChange={(v) => patchEdge(edge.id, { target: v })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => removeEdge(edge.id)}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
      </section>
    </div>
  )
}

function NodeSelect({
  value,
  nodes,
  onChange,
}: {
  value: string
  nodes: FlowNode[]
  onChange: (v: string) => void
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-40">
        <SelectValue placeholder="node" />
      </SelectTrigger>
      <SelectContent>
        {nodes.map((n) => (
          <SelectItem key={n.id} value={n.id}>
            {n.name || n.id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
