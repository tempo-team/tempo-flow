// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { decryptSecret, encryptSecret } from "../common/crypto"
import {
  DEFAULT_NOTIFICATION_CONFIG,
  type DiscordConfig,
  type EmailConfig,
  NOTIFICATION_SETTING_KEY,
  type NotificationConfig,
  type SlackConfig,
  type TelegramConfig,
  type WebhookConfig,
  secretAccessors,
} from "../notification/notification.config"
import { PrismaService } from "../prisma/prisma.service"
import type { UpdateNotificationSettingsRequest } from "./dto/setting.request"

const MASK = "********"

@Injectable()
export class SettingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private encKey(): string {
    return this.config.get<string>("SETTINGS_ENCRYPTION_KEY") ?? "tempo-flow-dev-key"
  }

  /** Decrypted config for internal use (sending notifications). */
  async getConfig(): Promise<NotificationConfig> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: NOTIFICATION_SETTING_KEY },
    })
    if (!row) return DEFAULT_NOTIFICATION_CONFIG
    const stored = JSON.parse(row.value) as NotificationConfig
    const key = this.encKey()
    for (const s of secretAccessors(stored)) {
      const v = s.get()
      if (v) s.set(decryptSecret(v, key))
    }
    return stored
  }

  /** Masked config for API responses (never expose secrets). */
  async getMaskedConfig(): Promise<NotificationConfig> {
    const config = await this.getConfig()
    for (const s of secretAccessors(config)) {
      if (s.get()) s.set(MASK)
    }
    return config
  }

  async update(input: UpdateNotificationSettingsRequest): Promise<NotificationConfig> {
    const current = await this.getConfig()
    const next: NotificationConfig = {
      events: { ...current.events, ...input.events },
      slack: mergeSlack(current.slack, input.slack),
      telegram: mergeTelegram(current.telegram, input.telegram),
      discord: mergeDiscord(current.discord, input.discord),
      email: mergeEmail(current.email, input.email),
      webhook: mergeWebhook(current.webhook, input.webhook),
    }

    const key = this.encKey()
    const toStore: NotificationConfig = JSON.parse(JSON.stringify(next))
    for (const s of secretAccessors(toStore)) {
      const v = s.get()
      if (v) s.set(encryptSecret(v, key))
    }

    await this.prisma.systemSetting.upsert({
      where: { key: NOTIFICATION_SETTING_KEY },
      update: { value: JSON.stringify(toStore) },
      create: { key: NOTIFICATION_SETTING_KEY, value: JSON.stringify(toStore) },
    })
    return this.getMaskedConfig()
  }
}

type Patch<T> = Partial<T> | undefined

function mergeSlack(
  current: SlackConfig | undefined,
  input: Patch<SlackConfig>,
): SlackConfig | undefined {
  if (!input && !current) return undefined
  return {
    enabled: input?.enabled ?? current?.enabled ?? false,
    webhookUrl: input?.webhookUrl ?? current?.webhookUrl ?? "",
  }
}

function mergeTelegram(
  current: TelegramConfig | undefined,
  input: Patch<TelegramConfig>,
): TelegramConfig | undefined {
  if (!input && !current) return undefined
  return {
    enabled: input?.enabled ?? current?.enabled ?? false,
    botToken: input?.botToken ?? current?.botToken ?? "",
    chatId: input?.chatId ?? current?.chatId ?? "",
  }
}

function mergeDiscord(
  current: DiscordConfig | undefined,
  input: Patch<DiscordConfig>,
): DiscordConfig | undefined {
  if (!input && !current) return undefined
  return {
    enabled: input?.enabled ?? current?.enabled ?? false,
    webhookUrl: input?.webhookUrl ?? current?.webhookUrl ?? "",
  }
}

function mergeEmail(
  current: EmailConfig | undefined,
  input: Patch<EmailConfig>,
): EmailConfig | undefined {
  if (!input && !current) return undefined
  return {
    enabled: input?.enabled ?? current?.enabled ?? false,
    host: input?.host ?? current?.host ?? "",
    port: input?.port ?? current?.port ?? 587,
    secure: input?.secure ?? current?.secure ?? false,
    user: input?.user ?? current?.user ?? "",
    pass: input?.pass ?? current?.pass ?? "",
    from: input?.from ?? current?.from ?? "",
    to: input?.to ?? current?.to ?? "",
  }
}

function mergeWebhook(
  current: WebhookConfig | undefined,
  input: Patch<WebhookConfig>,
): WebhookConfig | undefined {
  if (!input && !current) return undefined
  return {
    enabled: input?.enabled ?? current?.enabled ?? false,
    url: input?.url ?? current?.url ?? "",
    secret: input?.secret ?? current?.secret ?? "",
  }
}
