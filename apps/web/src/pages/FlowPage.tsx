// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useState } from "react"
import { Background, Controls, ReactFlow } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { ArrowLeft, Pencil, Play, Trash2 } from "lucide-react"
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
import { WebhookPanel } from "@/features/flow/WebhookPanel"
import { DeleteFlowDialog } from "@/features/flows/DeleteFlowDialog"
import { ManualRunDialog } from "@/features/runs/ManualRunDialog"
import { RunDetailSheet } from "@/features/runs/RunDetailSheet"
import { StatusBadge } from "@/features/runs/StatusBadge"
import { type FlowRunSummary, type FlowSummary, api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { toReactFlow } from "@/lib/flow-graph"

export function FlowPage() {
  const { id = "" } = useParams()
  const { can } = useAuth()
  const { resolvedTheme } = useTheme()
  const navigate = useNavigate()
  const [flow, setFlow] = useState<FlowSummary | null>(null)
  const [runs, setRuns] = useState<FlowRunSummary[]>([])
  const [selectedRun, setSelectedRun] = useState<string | null>(null)
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

  const graph = useMemo(() => (flow ? toReactFlow(flow.definition) : null), [flow])

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
          {can("edit", "flow") && (
            <Button variant="outline" onClick={() => navigate(`/flows/${flow.id}/edit`)}>
              <Pencil className="mr-2 size-4" /> Edit
            </Button>
          )}
          {can("edit", "flow") && (
            <Button variant="outline" size="icon" onClick={() => setToDelete(flow)}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="h-[560px] rounded-md">
            <ReactFlow
              nodes={graph.nodes}
              edges={graph.edges}
              fitView
              colorMode={resolvedTheme === "dark" ? "dark" : "light"}
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
        </CardContent>
      </Card>

      {can("edit", "flow") && <WebhookPanel flowId={flow.id} />}

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
                      className="cursor-pointer"
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
