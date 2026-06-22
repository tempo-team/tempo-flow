// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react"
import { Copy, Plus, Trash2, Webhook } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type CreatedWebhook, type WebhookSummary, api } from "@/lib/api"

function copy(text: string, what: string): void {
  void navigator.clipboard.writeText(text)
  toast.success(`${what} copied`)
}

export function WebhookPanel({ flowId }: { flowId: string }) {
  const [hooks, setHooks] = useState<WebhookSummary[] | null>(null)
  const [label, setLabel] = useState("")
  const [withSecret, setWithSecret] = useState(false)
  const [created, setCreated] = useState<CreatedWebhook | null>(null)

  function reload(): void {
    api
      .listWebhooks(flowId)
      .then(setHooks)
      .catch((e: Error) => toast.error("Failed to load webhooks", { description: e.message }))
  }
  useEffect(reload, [flowId])

  async function create(): Promise<void> {
    try {
      const result = await api.createWebhook(flowId, { label: label || undefined, withSecret })
      setCreated(result)
      setLabel("")
      setWithSecret(false)
      reload()
    } catch (e) {
      toast.error("Create failed", { description: (e as Error).message })
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await api.deleteWebhook(flowId, id)
      reload()
    } catch (e) {
      toast.error("Delete failed", { description: (e as Error).message })
    }
  }

  const hookUrl = created ? `${window.location.origin}/api/hooks/${created.token}` : ""

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Webhook className="size-4" /> Webhook triggers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="grid flex-1 gap-1.5">
            <Label className="text-xs">Label (optional)</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. CI deploy hook"
              className="h-8"
            />
          </div>
          <label className="flex items-center gap-2 pb-1.5 text-sm">
            <Checkbox checked={withSecret} onCheckedChange={(v) => setWithSecret(v === true)} />
            HMAC secret
          </label>
          <Button size="sm" onClick={create}>
            <Plus className="mr-1 size-4" /> Create
          </Button>
        </div>

        {hooks && hooks.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No webhooks. Create one to trigger this flow over HTTP.
          </p>
        )}
        {hooks?.map((h) => (
          <div
            key={h.id}
            className="flex items-center justify-between rounded-md border p-2 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">{h.label ?? "webhook"}</span>
              {h.hasSecret && <Badge variant="secondary">signed</Badge>}
              {!h.enabled && <Badge variant="outline">disabled</Badge>}
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => remove(h.id)}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
      </CardContent>

      <Dialog open={created !== null} onOpenChange={(o) => !o && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Webhook created</DialogTitle>
            <DialogDescription>
              Copy these now — the token and secret are shown only once.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Trigger URL (POST)</Label>
              <div className="flex gap-2">
                <Input readOnly value={hookUrl} className="h-8 font-mono text-xs" />
                <Button size="icon-sm" variant="outline" onClick={() => copy(hookUrl, "URL")}>
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
            {created?.secret && (
              <div className="grid gap-1.5">
                <Label className="text-xs">HMAC secret (header: x-tempo-signature)</Label>
                <div className="flex gap-2">
                  <Input readOnly value={created.secret} className="h-8 font-mono text-xs" />
                  <Button
                    size="icon-sm"
                    variant="outline"
                    onClick={() => copy(created.secret as string, "Secret")}
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setCreated(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
