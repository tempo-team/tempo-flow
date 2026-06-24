// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useState } from "react"
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { ArrowLeft, CalendarRange, Download, Pencil, Play, Trash2 } from "lucide-react"
import { useTheme } from "next-themes"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EventTriggerPanel } from "@/features/flow/EventTriggerPanel"
import { VersionHistory } from "@/features/flow/VersionHistory"
import { WebhookPanel } from "@/features/flow/WebhookPanel"
import { DeleteFlowDialog } from "@/features/flows/DeleteFlowDialog"
import { BackfillDialog } from "@/features/runs/BackfillDialog"
import { ManualRunDialog } from "@/features/runs/ManualRunDialog"
import { RunDetailSheet } from "@/features/runs/RunDetailSheet"
import { StatusBadge } from "@/features/runs/StatusBadge"
import { type FlowRunSummary, type FlowSummary, api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { flowNodeTypes } from "@/features/flow-editor/FlowNode"
import { toReactFlow } from "@/lib/flow-graph"
import { cn } from "@/lib/utils"
import { useRunStream } from "@/lib/useRunStream"

export function FlowPage() {
  const { id = "" } = useParams()
  const { can } = useAuth()
  const { resolvedTheme } = useTheme()
  const navigate = useNavigate()
  const [flow, setFlow] = useState<FlowSummary | null>(null)
  const [runs, setRuns] = useState<FlowRunSummary[]>([])
  const [selectedRun, setSelectedRun] = useState<string | null>(null)
  const [nodeStatus, setNodeStatus] = useState<Record<string, string>>({})
  const [toDelete, setToDelete] = useState<FlowSummary | null>(null)

  function reloadRuns(): void {
    api
      .listRuns(id)
      .then(setRuns)
      .catch(() => undefined)
  }

  useEffect(() => {
    api
      .getFlow(id)
      .then(setFlow)
      .catch((e: Error) => toast.error("Failed to load flow", { description: e.message }))
    reloadRuns()
  }, [id])

  // Overlay the selected run's per-node statuses onto the DAG (cleared when none).
  useEffect(() => {
    if (!selectedRun) {
      setNodeStatus({})
      return
    }
    api
      .getRun(selectedRun)
      .then((run) => {
        const map: Record<string, string> = {}
        for (const nr of run.nodeRuns ?? []) map[nr.nodeId] = nr.status
        setNodeStatus(map)
      })
      .catch(() => undefined)
  }, [selectedRun])

  // Live: reload the runs table on any run change; live-update the overlay for the
  // selected run as its nodes change status.
  useRunStream("*", (event) => {
    if (event.kind === "run.status" && event.flowId === id) reloadRuns()
    if (event.kind === "node.status" && event.flowRunId === selectedRun) {
      setNodeStatus((m) => ({ ...m, [event.nodeId]: event.status }))
    }
  })

  async function exportYaml(): Promise<void> {
    if (!flow) return
    try {
      const yaml = await api.exportFlowYaml(flow.id)
      const url = URL.createObjectURL(new Blob([yaml], { type: "application/x-yaml" }))
      const a = document.createElement("a")
      a.href = url
      a.download = `${flow.name}.yaml`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error("Export failed", { description: (e as Error).message })
    }
  }

  const graph = useMemo(() => (flow ? toReactFlow(flow.definition) : null), [flow])
  // Inject the selected run's per-node statuses onto the DAG nodes for the overlay.
  const overlayNodes = useMemo(
    () =>
      (graph?.nodes ?? []).map((n) => ({ ...n, data: { ...n.data, status: nodeStatus[n.id] } })),
    [graph, nodeStatus],
  )

  if (!flow || !graph) return <div className="p-6 text-muted-foreground">Loading…</div>

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{flow.name}</h1>
              <Badge variant={flow.enabled ? "default" : "secondary"}>
                {flow.enabled ? "enabled" : "disabled"}
              </Badge>
            </div>
            {flow.description && (
              <p className="text-sm text-muted-foreground">{flow.description}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {can("execute", "flow") && (
            <ManualRunDialog flowId={flow.id} onRan={reloadRuns}>
              <Button>
                <Play className="mr-2 size-4" /> Run
              </Button>
            </ManualRunDialog>
          )}
          {can("execute", "flow") && (
            <BackfillDialog flowId={flow.id} onDone={reloadRuns}>
              <Button variant="outline">
                <CalendarRange className="mr-2 size-4" /> Backfill
              </Button>
            </BackfillDialog>
          )}
          {can("edit", "flow") && (
            <Button variant="outline" onClick={() => navigate(`/flows/${flow.id}/edit`)}>
              <Pencil className="mr-2 size-4" /> Edit
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={exportYaml} title="Export YAML">
            <Download className="size-4" />
          </Button>
          {can("edit", "flow") && (
            <Button variant="outline" size="icon" onClick={() => setToDelete(flow)}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="h-[560px] overflow-hidden rounded-xl bg-muted/20">
            <ReactFlow
              nodes={overlayNodes}
              edges={graph.edges}
              nodeTypes={flowNodeTypes}
              fitView
              nodesDraggable={false}
              nodesConnectable={false}
              colorMode={resolvedTheme === "dark" ? "dark" : "light"}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
              <MiniMap pannable zoomable className="!bg-card" />
              <Controls showInteractive={false} className="!shadow-sm" />
            </ReactFlow>
          </div>
        </CardContent>
      </Card>

      {can("edit", "flow") && <WebhookPanel flowId={flow.id} />}
      {can("edit", "flow") && <EventTriggerPanel flowId={flow.id} />}
      {can("view", "flow") && (
        <VersionHistory flowId={flow.id} onRestored={() => api.getFlow(flow.id).then(setFlow)} />
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold">Runs</h2>
        <Card>
          <CardContent className="p-0">
            {runs.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No runs yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Finished</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow
                      key={run.id}
                      className={cn(
                        "cursor-pointer",
                        selectedRun === run.id && "bg-accent/60 hover:bg-accent/60",
                      )}
                      onClick={() => setSelectedRun(run.id)}
                    >
                      <TableCell>
                        <StatusBadge status={run.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{run.trigger}</TableCell>
                      <TableCell className="font-mono text-xs">{run.startedAt ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{run.finishedAt ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <RunDetailSheet
        runId={selectedRun}
        onOpenChange={(open) => !open && setSelectedRun(null)}
        onChanged={reloadRuns}
      />
      <DeleteFlowDialog
        flow={toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        onDeleted={() => navigate("/")}
      />
    </div>
  )
}
