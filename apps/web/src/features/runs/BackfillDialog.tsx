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
import { api } from "@/lib/api"

interface Props {
  flowId: string
  onDone: () => void
  children: ReactNode
}

export function BackfillDialog({ flowId, onDone, children }: Props) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [stepHours, setStepHours] = useState(24)
  const [busy, setBusy] = useState(false)

  const preview = from && to ? estimate(from, to, stepHours) : null

  async function run(): Promise<void> {
    setBusy(true)
    try {
      const { count } = await api.backfill(flowId, { from, to, stepHours })
      toast.success(`Backfill queued ${count} run(s)`)
      onDone()
      setOpen(false)
    } catch (e) {
      toast.error("Backfill failed", { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Backfill</DialogTitle>
          <DialogDescription>Create one run per interval across a date range.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Step (hours)</Label>
            <Input
              type="number"
              min={1}
              value={stepHours}
              onChange={(e) => setStepHours(Number(e.target.value))}
              className="w-32"
            />
          </div>
          {preview !== null && (
            <p className="text-sm text-muted-foreground">
              Will create <span className="font-medium">{preview}</span> run(s).
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={run} disabled={busy || !from || !to}>
            Run backfill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function estimate(from: string, to: string, stepHours: number): number {
  const start = new Date(from).getTime()
  const end = new Date(to).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0
  return Math.floor((end - start) / (Math.max(1, stepHours) * 3_600_000)) + 1
}
