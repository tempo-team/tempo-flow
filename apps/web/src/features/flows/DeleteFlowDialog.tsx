// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { type FlowSummary, api } from "@/lib/api"

interface Props {
  flow: FlowSummary | null
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}

export function DeleteFlowDialog({ flow, onOpenChange, onDeleted }: Props) {
  const [busy, setBusy] = useState(false)

  async function confirm(): Promise<void> {
    if (!flow) return
    setBusy(true)
    try {
      await api.deleteFlow(flow.id)
      toast.success(`Deleted "${flow.name}"`)
      onDeleted()
      onOpenChange(false)
    } catch (e) {
      toast.error("Delete failed", { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={flow !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete flow?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes <span className="font-medium">{flow?.name}</span> and its run
            history. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              void confirm()
            }}
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
