// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { type Node, type NodeProps, Position } from "@xyflow/react"
import { Handle } from "@xyflow/react"
import { Box, Globe, Layers, Sparkles, Terminal, Workflow } from "lucide-react"
import type { FlowNodeData } from "@/lib/flow-graph"
import { isActiveStatus, statusVar } from "@/lib/status"
import { cn } from "@/lib/utils"

const EXECUTOR_ICON: Record<string, typeof Workflow> = {
  http: Globe,
  k8s: Box,
  "spring-batch": Layers,
  subflow: Workflow,
  script: Terminal,
  llm: Sparkles,
}

const SOURCE_HANDLE = "!size-4 !border-2 !border-background !bg-primary cursor-crosshair"
const TARGET_HANDLE = "!size-3 !border-0 !bg-transparent"

// Inline style beats any CSS specificity battle with react-flow's stylesheet.
const HANDLE_STYLE = { pointerEvents: "all" } as const

/**
 * Custom DAG node: executor icon + title + type, with a left status stripe
 * (neutral in the editor, status-colored under a run overlay) and hover/selected
 * rings. Shared by the editor canvas and the read-only flow view.
 */
export function FlowNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  const Icon = EXECUTOR_ICON[data.executor] ?? Workflow
  const active = isActiveStatus(data.status)
  return (
    <div
      className={cn(
        "relative w-52 rounded-lg border bg-card shadow-sm transition",
        selected ? "border-ring ring-2 ring-ring/40" : "hover:border-muted-foreground/40",
      )}
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-1 rounded-l-lg", active && "animate-pulse")}
        style={{ background: statusVar(data.status) }}
      />
      <div className="flex items-center gap-2 px-3 pt-2.5 pl-4">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{data.label}</span>
      </div>
      <div className="px-3 pb-2.5 pl-4 font-mono text-[11px] text-muted-foreground">
        {data.executor}
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className={TARGET_HANDLE}
        isConnectable
        style={HANDLE_STYLE}
      />
      <Handle
        type="source"
        position={Position.Right}
        className={SOURCE_HANDLE}
        isConnectable
        style={HANDLE_STYLE}
      />
    </div>
  )
}

/** Stable node-types map for React Flow (must keep a constant reference). */
export const flowNodeTypes = { tempo: FlowNode }
