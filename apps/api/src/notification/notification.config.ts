// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

export interface SlackConfig {
  enabled: boolean
  webhookUrl: string
}
export interface TelegramConfig {
  enabled: boolean
  botToken: string
  chatId: string
}
export interface DiscordConfig {
  enabled: boolean
  webhookUrl: string
}
export interface EmailConfig {
  enabled: boolean
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
  to: string
}
export interface WebhookConfig {
  enabled: boolean
  url: string
  secret: string
}

export interface NotificationConfig {
  slack?: SlackConfig
  telegram?: TelegramConfig
  discord?: DiscordConfig
  email?: EmailConfig
  webhook?: WebhookConfig
  events: { failed: boolean; completed: boolean; retryExhausted: boolean }
}

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  events: { failed: true, completed: false, retryExhausted: true },
}

export const NOTIFICATION_SETTING_KEY = "notifications"

/**
 * Secret fields to encrypt at rest and mask in API responses. Returned as
 * accessors so the setting service loops instead of repeating per-field logic
 * for every channel.
 */
export function secretAccessors(
  c: NotificationConfig,
): { get: () => string | undefined; set: (v: string) => void }[] {
  const out: { get: () => string | undefined; set: (v: string) => void }[] = []
  if (c.slack)
    out.push({ get: () => c.slack?.webhookUrl, set: (v) => void (c.slack!.webhookUrl = v) })
  if (c.telegram)
    out.push({ get: () => c.telegram?.botToken, set: (v) => void (c.telegram!.botToken = v) })
  if (c.discord)
    out.push({ get: () => c.discord?.webhookUrl, set: (v) => void (c.discord!.webhookUrl = v) })
  if (c.email) out.push({ get: () => c.email?.pass, set: (v) => void (c.email!.pass = v) })
  if (c.webhook)
    out.push({ get: () => c.webhook?.secret, set: (v) => void (c.webhook!.secret = v) })
  return out
}
