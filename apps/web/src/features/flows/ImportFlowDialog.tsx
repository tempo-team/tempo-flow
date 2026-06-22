// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode, useState } from "react"
import { useNavigate } from "react-router-dom"
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
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"

export function ImportFlowDialog({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [yaml, setYaml] = useState("")
  const [busy, setBusy] = useState(false)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0]
    if (file) setYaml(await file.text())
  }

  async function submit(): Promise<void> {
    setBusy(true)
    try {
      const flow = await api.importFlow(yaml)
      toast.success(`Imported "${flow.name}"`)
      setOpen(false)
      setYaml("")
      navigate(`/flows/${flow.id}`)
    } catch (e) {
      toast.error("Import failed", { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import flow</DialogTitle>
          <DialogDescription>Paste a flow YAML or choose a .yaml file.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <input type="file" accept=".yaml,.yml" onChange={onFile} className="text-sm" />
          <Textarea
            value={yaml}
            onChange={(e) => setYaml(e.target.value)}
            placeholder="name: my-flow&#10;trigger: { type: manual }&#10;definition: { nodes: [...], edges: [...] }"
            rows={12}
            className="font-mono text-xs"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !yaml.trim()}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
