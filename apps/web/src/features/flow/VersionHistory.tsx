// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react"
import { ChevronDown, ChevronRight, History } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { type FlowVersion, api } from "@/lib/api"

interface NodeSnap {
  id: string
  label?: string
  executor?: string
}
interface EdgeSnap {
  id: string
  source: string
  target: string
  on?: string
}
interface DefSnap {
  nodes: NodeSnap[]
  edges: EdgeSnap[]
}

function parseDef(raw: string): DefSnap {
  try {
    const d = JSON.parse(raw) as { nodes?: NodeSnap[]; edges?: EdgeSnap[] }
    return { nodes: d.nodes ?? [], edges: d.edges ?? [] }
  } catch {
    return { nodes: [], edges: [] }
  }
}

function computeDiff(before: DefSnap, after: DefSnap) {
  const bNodeIds = new Set(before.nodes.map((n) => n.id))
  const aNodeIds = new Set(after.nodes.map((n) => n.id))
  const bEdgeIds = new Set(before.edges.map((e) => e.id))
  const aEdgeIds = new Set(after.edges.map((e) => e.id))
  return {
    addedNodes: after.nodes.filter((n) => !bNodeIds.has(n.id)),
    removedNodes: before.nodes.filter((n) => !aNodeIds.has(n.id)),
    addedEdges: after.edges.filter((e) => !bEdgeIds.has(e.id)),
    removedEdges: before.edges.filter((e) => !aEdgeIds.has(e.id)),
  }
}

export function VersionHistory({ flowId }: { flowId: string }) {
  const [versions, setVersions] = useState<FlowVersion[] | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    api
      .listVersions(flowId)
      .then(setVersions)
      .catch((e: Error) => toast.error("Failed to load versions", { description: e.message }))
  }, [flowId])

  if (!versions || versions.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" /> Version history
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {versions.map((v, i) => {
          const isOpen = expanded === v.id
          const after = parseDef(v.definition)
          const prevVersion = versions[i + 1]
          const before = prevVersion ? parseDef(prevVersion.definition) : null
          const diff = before ? computeDiff(before, after) : null
          const totalChanges = diff
            ? diff.addedNodes.length +
              diff.removedNodes.length +
              diff.addedEdges.length +
              diff.removedEdges.length
            : 0

          return (
            <div key={v.id} className="rounded-md border text-sm">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 p-2 hover:bg-muted/50 transition-colors text-left"
                onClick={() => setExpanded(isOpen ? null : v.id)}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {isOpen ? (
                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-mono text-xs text-muted-foreground shrink-0">
                    v{v.version}
                  </span>
                  <span className="font-medium truncate">{v.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {after.nodes.length} nodes
                  </span>
                  {totalChanges > 0 && (
                    <span className={cn("text-xs shrink-0", "text-muted-foreground")}>
                      {[
                        diff!.addedNodes.length > 0 && `+${diff!.addedNodes.length} node`,
                        diff!.removedNodes.length > 0 && `-${diff!.removedNodes.length} node`,
                        diff!.addedEdges.length > 0 && `+${diff!.addedEdges.length} edge`,
                        diff!.removedEdges.length > 0 && `-${diff!.removedEdges.length} edge`,
                      ]
                        .filter(Boolean)
                        .join("  ")}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(v.createdAt).toLocaleString()}
                </span>
              </button>

              {isOpen && (
                <div className="border-t px-3 pb-3 pt-2 text-xs space-y-1.5">
                  {!before ? (
                    <p className="text-muted-foreground italic">Initial snapshot</p>
                  ) : totalChanges === 0 ? (
                    <p className="text-muted-foreground italic">
                      No structural changes from v{prevVersion!.version}
                    </p>
                  ) : (
                    <>
                      <p className="font-medium text-muted-foreground mb-1">
                        Changes from v{prevVersion!.version}:
                      </p>
                      {diff!.addedNodes.map((n) => (
                        <div
                          key={n.id}
                          className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400"
                        >
                          <span className="font-mono font-bold w-3">+</span>
                          <span>{n.label ?? n.id}</span>
                          {n.executor && (
                            <span className="text-muted-foreground">({n.executor})</span>
                          )}
                        </div>
                      ))}
                      {diff!.removedNodes.map((n) => (
                        <div key={n.id} className="flex items-center gap-2 text-destructive">
                          <span className="font-mono font-bold w-3">−</span>
                          <span>{n.label ?? n.id}</span>
                          {n.executor && (
                            <span className="text-muted-foreground">({n.executor})</span>
                          )}
                        </div>
                      ))}
                      {diff!.addedEdges.map((e) => (
                        <div
                          key={e.id}
                          className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400"
                        >
                          <span className="font-mono font-bold w-3">+</span>
                          <span className="font-mono">
                            {e.source} → {e.target}
                          </span>
                          {e.on && <span className="text-muted-foreground">({e.on})</span>}
                        </div>
                      ))}
                      {diff!.removedEdges.map((e) => (
                        <div key={e.id} className="flex items-center gap-2 text-destructive">
                          <span className="font-mono font-bold w-3">−</span>
                          <span className="font-mono">
                            {e.source} → {e.target}
                          </span>
                          {e.on && <span className="text-muted-foreground">({e.on})</span>}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
