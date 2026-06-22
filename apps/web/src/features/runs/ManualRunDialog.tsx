// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { KeyValueEditor } from "@/features/flow-editor/KeyValueEditor"
import { api } from "@/lib/api"

interface Props {
  flowId: string
  onRan: () => void
  children: ReactNode
}

export function ManualRunDialog({ flowId, onRan, children }: Props) {
  const [open, setOpen] = useState(false)
  const [runDate, setRunDate] = useState("")
  const [params, setParams] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function run(): Promise<void> {
    setBusy(true)
    try {
      await api.runFlow(flowId, {
        runDate: runDate || undefined,
        params: Object.keys(params).length ? params : undefined,
      })
      toast.success("Run triggered")
      onRan()
      setOpen(false)
    } catch (e) {
      toast.error("Run failed", { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run flow</DialogTitle>
          <DialogDescription>
            Optionally backfill a reservation date and override params.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="runDate">Run date (optional)</Label>
            <Input
              id="runDate"
              type="date"
              value={runDate}
              onChange={(e) => setRunDate(e.target.value)}
            />
          </div>
          <KeyValueEditor label="Param overrides" value={params} onChange={setParams} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={run} disabled={busy}>
            Run now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
