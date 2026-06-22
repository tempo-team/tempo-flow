// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react"
import { Plus, Radio, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EventTrigger, api } from "@/lib/api"

export function EventTriggerPanel({ flowId }: { flowId: string }) {
  const [triggers, setTriggers] = useState<EventTrigger[] | null>(null)
  const [topic, setTopic] = useState("")
  const [filterKey, setFilterKey] = useState("")
  const [filterValue, setFilterValue] = useState("")

  function reload(): void {
    api
      .listEventTriggers(flowId)
      .then(setTriggers)
      .catch((e: Error) => toast.error("Failed to load event triggers", { description: e.message }))
  }
  useEffect(reload, [flowId])

  async function create(): Promise<void> {
    if (!topic.trim()) return
    const filter = filterKey.trim() ? { [filterKey.trim()]: filterValue } : undefined
    try {
      await api.createEventTrigger(flowId, { topic: topic.trim(), filter })
      setTopic("")
      setFilterKey("")
      setFilterValue("")
      toast.success("Event trigger created")
      reload()
    } catch (e) {
      toast.error("Create failed", { description: (e as Error).message })
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await api.deleteEventTrigger(flowId, id)
      reload()
    } catch (e) {
      toast.error("Delete failed", { description: (e as Error).message })
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Radio className="size-4" /> Event triggers
          <Badge variant="outline">redis stream</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="grid flex-1 gap-1.5">
            <Label className="text-xs">Topic (stream key)</Label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="orders.created"
              className="h-8"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Filter key</Label>
            <Input
              value={filterKey}
              onChange={(e) => setFilterKey(e.target.value)}
              placeholder="optional"
              className="h-8 w-28"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">= value</Label>
            <Input
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              className="h-8 w-28"
            />
          </div>
          <Button size="sm" onClick={create}>
            <Plus className="mr-1 size-4" /> Add
          </Button>
        </div>

        {triggers && triggers.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No event triggers. Publish to a Redis stream with{" "}
            <code className="text-xs">XADD &lt;topic&gt; * key val</code> to fire this flow.
          </p>
        )}
        {triggers?.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between rounded-md border p-2 text-sm"
          >
            <div className="flex items-center gap-2">
              <code className="text-xs">{t.topic}</code>
              {t.filterJson && <Badge variant="secondary">filtered</Badge>}
              {!t.enabled && <Badge variant="outline">disabled</Badge>}
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => remove(t.id)}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
