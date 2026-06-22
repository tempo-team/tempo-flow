// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { type NotificationConfig, api } from "@/lib/api"
import { useAuth } from "@/lib/auth"

const MASK = "********"

const EMPTY: Required<Omit<NotificationConfig, "events">> & Pick<NotificationConfig, "events"> = {
  slack: { enabled: false, webhookUrl: "" },
  telegram: { enabled: false, botToken: "", chatId: "" },
  discord: { enabled: false, webhookUrl: "" },
  email: {
    enabled: false,
    host: "",
    port: 587,
    secure: false,
    user: "",
    pass: "",
    from: "",
    to: "",
  },
  webhook: { enabled: false, url: "", secret: "" },
  events: { failed: true, completed: false, retryExhausted: true },
}

/** Secret fields cleared from the payload when still masked (server keeps them). */
const SECRETS: [keyof NotificationConfig, string][] = [
  ["slack", "webhookUrl"],
  ["telegram", "botToken"],
  ["discord", "webhookUrl"],
  ["email", "pass"],
  ["webhook", "secret"],
]

function hydrate(c: NotificationConfig): NotificationConfig {
  return {
    slack: { ...EMPTY.slack, ...c.slack },
    telegram: { ...EMPTY.telegram, ...c.telegram },
    discord: { ...EMPTY.discord, ...c.discord },
    email: { ...EMPTY.email, ...c.email },
    webhook: { ...EMPTY.webhook, ...c.webhook },
    events: { ...EMPTY.events, ...c.events },
  }
}

export function SettingsPage() {
  const { can } = useAuth()
  const canManage = can("manage", "setting")
  const [config, setConfig] = useState<NotificationConfig | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api
      .getNotificationSettings()
      .then((c) => setConfig(hydrate(c)))
      .catch((e: Error) => toast.error("Failed to load settings", { description: e.message }))
  }, [])

  if (!config) return <div className="p-6 text-muted-foreground">Loading…</div>

  function patch<K extends keyof NotificationConfig>(
    channel: K,
    p: Partial<NonNullable<NotificationConfig[K]>>,
  ): void {
    setConfig((c) => (c ? { ...c, [channel]: { ...(c[channel] as object), ...p } } : c))
  }

  async function save(): Promise<void> {
    if (!config) return
    setSaving(true)
    try {
      const payload = JSON.parse(JSON.stringify(config)) as Record<string, Record<string, unknown>>
      for (const [ch, field] of SECRETS) {
        if (payload[ch] && payload[ch][field] === MASK) delete payload[ch][field]
      }
      const updated = await api.updateNotificationSettings(payload as Partial<NotificationConfig>)
      setConfig(hydrate(updated))
      toast.success("Settings saved")
    } catch (e) {
      toast.error("Save failed", { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const dis = !canManage

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Notification channels and events.</p>
      </div>

      <Channel
        title="Slack"
        desc="Incoming webhook"
        enabled={config.slack?.enabled ?? false}
        onToggle={(v) => patch("slack", { enabled: v })}
        disabled={dis}
      >
        <Field label="Webhook URL">
          <Input
            value={config.slack?.webhookUrl ?? ""}
            onChange={(e) => patch("slack", { webhookUrl: e.target.value })}
            placeholder="https://hooks.slack.com/services/..."
            disabled={dis}
          />
        </Field>
      </Channel>

      <Channel
        title="Telegram"
        desc="Bot API"
        enabled={config.telegram?.enabled ?? false}
        onToggle={(v) => patch("telegram", { enabled: v })}
        disabled={dis}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Bot token">
            <Input
              value={config.telegram?.botToken ?? ""}
              onChange={(e) => patch("telegram", { botToken: e.target.value })}
              disabled={dis}
            />
          </Field>
          <Field label="Chat id">
            <Input
              value={config.telegram?.chatId ?? ""}
              onChange={(e) => patch("telegram", { chatId: e.target.value })}
              disabled={dis}
            />
          </Field>
        </div>
      </Channel>

      <Channel
        title="Discord"
        desc="Channel webhook"
        enabled={config.discord?.enabled ?? false}
        onToggle={(v) => patch("discord", { enabled: v })}
        disabled={dis}
      >
        <Field label="Webhook URL">
          <Input
            value={config.discord?.webhookUrl ?? ""}
            onChange={(e) => patch("discord", { webhookUrl: e.target.value })}
            placeholder="https://discord.com/api/webhooks/..."
            disabled={dis}
          />
        </Field>
      </Channel>

      <Channel
        title="Email"
        desc="SMTP"
        enabled={config.email?.enabled ?? false}
        onToggle={(v) => patch("email", { enabled: v })}
        disabled={dis}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Host">
            <Input
              value={config.email?.host ?? ""}
              onChange={(e) => patch("email", { host: e.target.value })}
              placeholder="smtp.example.com"
              disabled={dis}
            />
          </Field>
          <Field label="Port">
            <Input
              type="number"
              value={config.email?.port ?? 587}
              onChange={(e) => patch("email", { port: Number(e.target.value) })}
              disabled={dis}
            />
          </Field>
          <Field label="User">
            <Input
              value={config.email?.user ?? ""}
              onChange={(e) => patch("email", { user: e.target.value })}
              disabled={dis}
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={config.email?.pass ?? ""}
              onChange={(e) => patch("email", { pass: e.target.value })}
              disabled={dis}
            />
          </Field>
          <Field label="From">
            <Input
              value={config.email?.from ?? ""}
              onChange={(e) => patch("email", { from: e.target.value })}
              placeholder="tempo-flow@example.com"
              disabled={dis}
            />
          </Field>
          <Field label="To">
            <Input
              value={config.email?.to ?? ""}
              onChange={(e) => patch("email", { to: e.target.value })}
              placeholder="oncall@example.com"
              disabled={dis}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={config.email?.secure ?? false}
            onCheckedChange={(v) => patch("email", { secure: v })}
            disabled={dis}
          />
          TLS (secure)
        </label>
      </Channel>

      <Channel
        title="Webhook"
        desc="Generic outbound POST (optionally HMAC-signed)"
        enabled={config.webhook?.enabled ?? false}
        onToggle={(v) => patch("webhook", { enabled: v })}
        disabled={dis}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="URL">
            <Input
              value={config.webhook?.url ?? ""}
              onChange={(e) => patch("webhook", { url: e.target.value })}
              placeholder="https://example.com/hook"
              disabled={dis}
            />
          </Field>
          <Field label="Signing secret (optional)">
            <Input
              type="password"
              value={config.webhook?.secret ?? ""}
              onChange={(e) => patch("webhook", { secret: e.target.value })}
              disabled={dis}
            />
          </Field>
        </div>
      </Channel>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Events</CardTitle>
          <CardDescription>When to notify</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <EventToggle
            label="Flow failed"
            checked={config.events.failed}
            onChange={(v) => patch("events", { failed: v })}
            disabled={dis}
          />
          <EventToggle
            label="Flow completed"
            checked={config.events.completed}
            onChange={(v) => patch("events", { completed: v })}
            disabled={dis}
          />
          <EventToggle
            label="Retries exhausted"
            checked={config.events.retryExhausted}
            onChange={(v) => patch("events", { retryExhausted: v })}
            disabled={dis}
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

function Channel({
  title,
  desc,
  enabled,
  onToggle,
  disabled,
  children,
}: {
  title: string
  desc: string
  enabled: boolean
  onToggle: (v: boolean) => void
  disabled: boolean
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{desc}</CardDescription>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} disabled={disabled} />
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
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
