// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react"
import { ArrowLeft, Loader2, Save } from "lucide-react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { CanvasMode } from "@/features/flow-editor/CanvasMode"
import { CronBuilder } from "@/features/flow-editor/CronBuilder"
import { FormMode } from "@/features/flow-editor/FormMode"
import { saveFlow } from "@/features/flow-editor/save"
import { type FlowEditorState, emptyState, stateFromFlow } from "@/features/flow-editor/state"
import { api } from "@/lib/api"

export function FlowEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)
  const [state, setState] = useState<FlowEditorState | null>(isEdit ? null : emptyState())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    api
      .getFlow(id)
      .then((flow) => setState(stateFromFlow(flow)))
      .catch((e: Error) => toast.error("Failed to load flow", { description: e.message }))
  }, [id])

  if (!state) {
    return <div className="p-6 text-muted-foreground">Loading…</div>
  }

  function patch(p: Partial<FlowEditorState>): void {
    setState((s) => (s ? { ...s, ...p } : s))
  }

  async function onSave(): Promise<void> {
    if (!state) return
    setSaving(true)
    try {
      const result = await saveFlow(state, id ?? null)
      if (!result.ok) {
        toast.error("Invalid flow", { description: result.errors.join("; ") })
        return
      }
      toast.success(isEdit ? "Flow updated" : "Flow created")
      navigate(`/flows/${result.flowId}`)
    } catch (e) {
      toast.error("Save failed", { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="text-xl font-semibold tracking-tight">
            {isEdit ? "Edit flow" : "New flow"}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Save
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6">
          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={state.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="nightly-etl"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={state.description}
              onChange={(e) => patch({ description: e.target.value })}
              rows={2}
            />
          </div>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>Trigger</Label>
                <Select
                  value={state.triggerType}
                  onValueChange={(v) => patch({ triggerType: v as FlowEditorState["triggerType"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="cron">Cron</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {state.triggerType === "cron" && (
              <div className="rounded-lg border p-4">
                <Label className="mb-3 block text-sm font-medium">Schedule</Label>
                <CronBuilder
                  value={state.cronExpr}
                  onChange={(expr) => patch({ cronExpr: expr })}
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Overlap policy</Label>
              <Select
                value={state.overlapPolicy}
                onValueChange={(v) =>
                  patch({ overlapPolicy: v as FlowEditorState["overlapPolicy"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Skip if running</SelectItem>
                  <SelectItem value="allow">Allow overlap</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch
                id="enabled"
                checked={state.enabled}
                onCheckedChange={(v) => patch({ enabled: v })}
              />
              <Label htmlFor="enabled">Enabled</Label>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sla">SLA (seconds, 0 = none)</Label>
            <Input
              id="sla"
              type="number"
              min={0}
              value={state.slaSeconds}
              onChange={(e) => patch({ slaSeconds: Number(e.target.value) })}
              className="w-40"
            />
            <p className="text-xs text-muted-foreground">
              A run exceeding this deadline is failed and a notification is sent.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="approval"
              checked={state.requiresApproval}
              onCheckedChange={(v) => patch({ requiresApproval: v })}
            />
            <Label htmlFor="approval">Require approval before run (one-off triggers only)</Label>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="canvas">
        <TabsList>
          <TabsTrigger value="canvas">Canvas</TabsTrigger>
          <TabsTrigger value="form">Form</TabsTrigger>
        </TabsList>
        <TabsContent value="form" className="mt-4">
          <FormMode
            definition={state.definition}
            onChange={(definition) => patch({ definition })}
          />
        </TabsContent>
        <TabsContent value="canvas" className="mt-4">
          <CanvasMode
            definition={state.definition}
            onChange={(definition) => patch({ definition })}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
