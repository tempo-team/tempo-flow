// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { decryptSecret, encryptSecret } from "../common/crypto"
import {
  DEFAULT_NOTIFICATION_CONFIG,
  NOTIFICATION_SETTING_KEY,
  type NotificationConfig,
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
    if (stored.slack?.webhookUrl)
      stored.slack.webhookUrl = decryptSecret(stored.slack.webhookUrl, key)
    if (stored.telegram?.botToken)
      stored.telegram.botToken = decryptSecret(stored.telegram.botToken, key)
    return stored
  }

  /** Masked config for API responses (never expose secrets). */
  async getMaskedConfig(): Promise<NotificationConfig> {
    const config = await this.getConfig()
    if (config.slack?.webhookUrl) config.slack.webhookUrl = MASK
    if (config.telegram?.botToken) config.telegram.botToken = MASK
    return config
  }

  async update(input: UpdateNotificationSettingsRequest): Promise<NotificationConfig> {
    const current = await this.getConfig()
    const next: NotificationConfig = {
      events: { ...current.events, ...input.events },
      slack: mergeSlack(current.slack, input.slack),
      telegram: mergeTelegram(current.telegram, input.telegram),
    }

    // Encrypt secrets before persisting.
    const key = this.encKey()
    const toStore: NotificationConfig = JSON.parse(JSON.stringify(next))
    if (toStore.slack?.webhookUrl)
      toStore.slack.webhookUrl = encryptSecret(toStore.slack.webhookUrl, key)
    if (toStore.telegram?.botToken)
      toStore.telegram.botToken = encryptSecret(toStore.telegram.botToken, key)

    await this.prisma.systemSetting.upsert({
      where: { key: NOTIFICATION_SETTING_KEY },
      update: { value: JSON.stringify(toStore) },
      create: { key: NOTIFICATION_SETTING_KEY, value: JSON.stringify(toStore) },
    })
    return this.getMaskedConfig()
  }
}

function mergeSlack(
  current: NotificationConfig["slack"],
  input: UpdateNotificationSettingsRequest["slack"],
): NotificationConfig["slack"] {
  if (!input && !current) return undefined
  return {
    enabled: input?.enabled ?? current?.enabled ?? false,
    // Keep the existing secret when the caller omits it.
    webhookUrl: input?.webhookUrl ?? current?.webhookUrl ?? "",
  }
}

function mergeTelegram(
  current: NotificationConfig["telegram"],
  input: UpdateNotificationSettingsRequest["telegram"],
): NotificationConfig["telegram"] {
  if (!input && !current) return undefined
  return {
    enabled: input?.enabled ?? current?.enabled ?? false,
    botToken: input?.botToken ?? current?.botToken ?? "",
    chatId: input?.chatId ?? current?.chatId ?? "",
  }
}
