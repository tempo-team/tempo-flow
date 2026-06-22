// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { type NotificationConfig, api } from "@/lib/api"
import { useAuth } from "@/lib/auth"

const EMPTY: NotificationConfig = {
  slack: { enabled: false, webhookUrl: "" },
  telegram: { enabled: false, botToken: "", chatId: "" },
  events: { failed: true, completed: false, retryExhausted: true },
}

export function SettingsPage() {
  const { can } = useAuth()
  const canManage = can("manage", "setting")
  const [config, setConfig] = useState<NotificationConfig | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api
      .getNotificationSettings()
      .then((c) =>
        setConfig({
          ...EMPTY,
          ...c,
          slack: { ...EMPTY.slack!, ...c.slack },
          telegram: { ...EMPTY.telegram!, ...c.telegram },
        }),
      )
      .catch((e: Error) => toast.error("Failed to load settings", { description: e.message }))
  }, [])

  if (!config) return <div className="p-6 text-muted-foreground">Loading…</div>

  function patchSlack(p: Partial<NonNullable<NotificationConfig["slack"]>>): void {
    setConfig((c) => (c ? { ...c, slack: { ...c.slack!, ...p } } : c))
  }
  function patchTelegram(p: Partial<NonNullable<NotificationConfig["telegram"]>>): void {
    setConfig((c) => (c ? { ...c, telegram: { ...c.telegram!, ...p } } : c))
  }
  function patchEvents(p: Partial<NotificationConfig["events"]>): void {
    setConfig((c) => (c ? { ...c, events: { ...c.events, ...p } } : c))
  }

  async function save(): Promise<void> {
    if (!config) return
    setSaving(true)
    try {
      // A masked secret ("********") means "unchanged" — omit it.
      const slack = config.slack && {
        enabled: config.slack.enabled,
        ...(config.slack.webhookUrl !== "********" ? { webhookUrl: config.slack.webhookUrl } : {}),
      }
      const telegram = config.telegram && {
        enabled: config.telegram.enabled,
        chatId: config.telegram.chatId,
        ...(config.telegram.botToken !== "********" ? { botToken: config.telegram.botToken } : {}),
      }
      const updated = await api.updateNotificationSettings({
        slack: slack as NotificationConfig["slack"],
        telegram: telegram as NotificationConfig["telegram"],
        events: config.events,
      })
      setConfig({
        ...EMPTY,
        ...updated,
        slack: { ...EMPTY.slack!, ...updated.slack },
        telegram: { ...EMPTY.telegram!, ...updated.telegram },
      })
      toast.success("Settings saved")
    } catch (e) {
      toast.error("Save failed", { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Notification channels and events.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Slack</CardTitle>
          <CardDescription>Incoming webhook</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={config.slack?.enabled ?? false}
              onCheckedChange={(v) => patchSlack({ enabled: v })}
              disabled={!canManage}
            />
            <Label>Enabled</Label>
          </div>
          <div className="grid gap-1.5">
            <Label>Webhook URL</Label>
            <Input
              value={config.slack?.webhookUrl ?? ""}
              onChange={(e) => patchSlack({ webhookUrl: e.target.value })}
              placeholder="https://hooks.slack.com/services/..."
              disabled={!canManage}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Telegram</CardTitle>
          <CardDescription>Bot API</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={config.telegram?.enabled ?? false}
              onCheckedChange={(v) => patchTelegram({ enabled: v })}
              disabled={!canManage}
            />
            <Label>Enabled</Label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Bot token</Label>
              <Input
                value={config.telegram?.botToken ?? ""}
                onChange={(e) => patchTelegram({ botToken: e.target.value })}
                disabled={!canManage}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Chat id</Label>
              <Input
                value={config.telegram?.chatId ?? ""}
                onChange={(e) => patchTelegram({ chatId: e.target.value })}
                disabled={!canManage}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Events</CardTitle>
          <CardDescription>When to notify</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <EventToggle
            label="Flow failed"
            checked={config.events.failed}
            onChange={(v) => patchEvents({ failed: v })}
            disabled={!canManage}
          />
          <EventToggle
            label="Flow completed"
            checked={config.events.completed}
            onChange={(v) => patchEvents({ completed: v })}
            disabled={!canManage}
          />
          <EventToggle
            label="Retries exhausted"
            checked={config.events.retryExhausted}
            onChange={(v) => patchEvents({ retryExhausted: v })}
            disabled={!canManage}
          />
        </CardContent>
      </Card>

      {canManage && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save settings
          </Button>
        </div>
      )}
    </div>
  )
}

function EventToggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
      <Label>{label}</Label>
    </div>
  )
}
