// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react"
import { Ban, Check, RefreshCw, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { type FlowRunSummary, api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { useRunStream } from "@/lib/useRunStream"
import { StatusBadge } from "./StatusBadge"

interface Props {
  runId: string | null
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}

const TERMINAL = ["SUCCESS", "FAILED", "CANCELED"]

export function RunDetailSheet({ runId, onOpenChange, onChanged }: Props) {
  const { can } = useAuth()
  const [run, setRun] = useState<FlowRunSummary | null>(null)
  const [logs, setLogs] = useState<Record<string, string[]>>({})

  function load(): void {
    if (!runId) return
    api
      .getRun(runId)
      .then(setRun)
      .catch((e: Error) => toast.error("Failed to load run", { description: e.message }))
  }

  useEffect(() => {
    setRun(null)
    setLogs({})
    load()
  }, [runId])

  // Live updates: stream log lines into per-node buffers; refetch on status change.
  useRunStream(runId, (event) => {
    if (event.kind === "node.log") {
      setLogs((m) => ({ ...m, [event.nodeId]: [...(m[event.nodeId] ?? []), event.line] }))
    } else {
      load()
    }
  })

  async function cancel(): Promise<void> {
    if (!runId) return
    try {
      await api.cancelRun(runId)
      toast.success("Run canceled")
      load()
      onChanged()
    } catch (e) {
      toast.error("Cancel failed", { description: (e as Error).message })
    }
  }

  async function decide(kind: "approve" | "reject"): Promise<void> {
    if (!runId) return
    try {
      await (kind === "approve" ? api.approveRun(runId) : api.rejectRun(runId))
      toast.success(kind === "approve" ? "Run approved" : "Run rejected")
      load()
      onChanged()
    } catch (e) {
      toast.error("Action failed", { description: (e as Error).message })
    }
  }

  const active = run !== null && !TERMINAL.includes(run.status)
  const awaitingApproval = run?.status === "PENDING_APPROVAL"

  return (
    <Sheet open={runId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Run details {run && <StatusBadge status={run.status} />}
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-8">
          {!run ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={load}>
                  <RefreshCw className="mr-1 size-4" /> Refresh
                </Button>
                {active && can("execute", "run") && (
                  <Button size="sm" variant="outline" onClick={cancel}>
                    <Ban className="mr-1 size-4" /> Cancel
                  </Button>
                )}
                {awaitingApproval && can("approve", "run") && (
                  <>
                    <Button size="sm" onClick={() => decide("approve")}>
                      <Check className="mr-1 size-4" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => decide("reject")}>
                      <X className="mr-1 size-4" /> Reject
                    </Button>
                  </>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <Meta label="Trigger" value={run.trigger} />
                <Meta label="Started" value={run.startedAt ?? "—"} />
                <Meta label="Finished" value={run.finishedAt ?? "—"} />
              </dl>
              <Separator />
              <div className="space-y-3">
                <p className="text-sm font-medium">Nodes</p>
                {(run.nodeRuns ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No node runs recorded.</p>
                )}
                {(run.nodeRuns ?? []).map((n) => (
                  <div key={n.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{n.nodeId}</span>
                      <StatusBadge status={n.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {n.executor} · attempt {n.attempt}
                    </p>
                    {n.errorMessage && (
                      <p className="mt-1 text-xs text-destructive">{n.errorMessage}</p>
                    )}
                    {(logs[n.nodeId]?.length ?? 0) > 0 && (
                      <pre className="mt-2 max-h-40 overflow-auto rounded bg-black/90 p-2 font-mono text-xs text-green-400">
                        {logs[n.nodeId].join("\n")}
                      </pre>
                    )}
                    {(n.request != null || n.response != null) && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-muted-foreground">
                          request / response
                        </summary>
                        <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
                          {JSON.stringify({ request: n.request, response: n.response }, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xs">{value}</dd>
    </div>
  )
}
