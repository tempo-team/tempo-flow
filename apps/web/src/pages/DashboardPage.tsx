// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react"
import { MoreHorizontal, Pencil, Play, Plus, Trash2, Workflow } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DeleteFlowDialog } from "@/features/flows/DeleteFlowDialog"
import { type FlowSummary, api } from "@/lib/api"
import { useAuth } from "@/lib/auth"

export function DashboardPage() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [flows, setFlows] = useState<FlowSummary[] | null>(null)
  const [pendingDelete, setPendingDelete] = useState<FlowSummary | null>(null)

  function reload(): void {
    api
      .listFlows()
      .then(setFlows)
      .catch((e: Error) => toast.error("Failed to load flows", { description: e.message }))
  }

  useEffect(reload, [])

  async function runNow(flow: FlowSummary): Promise<void> {
    try {
      await api.runFlow(flow.id, {})
      toast.success(`Triggered "${flow.name}"`)
    } catch (e) {
      toast.error("Run failed", { description: (e as Error).message })
    }
  }

  const canEdit = can("edit", "flow")
  const canRun = can("execute", "flow")

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Flows</h1>
          <p className="text-sm text-muted-foreground">Register, schedule, and run batch flows.</p>
        </div>
        {canEdit && (
          <Button onClick={() => navigate("/flows/new")}>
            <Plus className="mr-2 size-4" /> New flow
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="sr-only">
          <CardTitle>Flows</CardTitle>
          <CardDescription>All flows</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {flows === null ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : flows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Workflow className="size-10 text-muted-foreground" />
              <div>
                <p className="font-medium">No flows yet</p>
                <p className="text-sm text-muted-foreground">
                  Create your first flow to get started.
                </p>
              </div>
              {canEdit && (
                <Button onClick={() => navigate("/flows/new")}>
                  <Plus className="mr-2 size-4" /> New flow
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Nodes</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {flows.map((flow) => (
                  <TableRow key={flow.id}>
                    <TableCell className="font-medium">
                      <Link to={`/flows/${flow.id}`} className="hover:underline">
                        {flow.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {flow.trigger.type === "cron" ? (
                        <code className="text-xs">{flow.trigger.expr}</code>
                      ) : (
                        "manual"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={flow.enabled ? "default" : "secondary"}>
                        {flow.enabled ? "enabled" : "disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell>{flow.definition.nodes.length}</TableCell>
                    <TableCell>
                      {(canEdit || canRun) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Actions">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canRun && (
                              <DropdownMenuItem onClick={() => runNow(flow)}>
                                <Play className="mr-2 size-4" /> Run now
                              </DropdownMenuItem>
                            )}
                            {canEdit && (
                              <DropdownMenuItem onClick={() => navigate(`/flows/${flow.id}/edit`)}>
                                <Pencil className="mr-2 size-4" /> Edit
                              </DropdownMenuItem>
                            )}
                            {canEdit && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setPendingDelete(flow)}
                              >
                                <Trash2 className="mr-2 size-4" /> Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <DeleteFlowDialog
        flow={pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onDeleted={reload}
      />
    </div>
  )
}
