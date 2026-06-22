// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from "@nestjs/common"
import type { NotificationConfig } from "./notification.config"
import { DiscordStrategy } from "./strategy/discord.strategy"
import { EmailStrategy } from "./strategy/email.strategy"
import { SlackStrategy } from "./strategy/slack.strategy"
import { TelegramStrategy } from "./strategy/telegram.strategy"
import { WebhookStrategy } from "./strategy/webhook.strategy"
import type { NotificationStrategy } from "./notification.types"

/**
 * Builds the active notification strategies from the stored config. Adding a new
 * channel is a single class + one branch here (Strategy pattern).
 */
@Injectable()
export class NotificationFactory {
  build(config: NotificationConfig): NotificationStrategy[] {
    const strategies: NotificationStrategy[] = []
    if (config.slack?.enabled && config.slack.webhookUrl) {
      strategies.push(new SlackStrategy(config.slack.webhookUrl))
    }
    if (config.telegram?.enabled && config.telegram.botToken && config.telegram.chatId) {
      strategies.push(new TelegramStrategy(config.telegram.botToken, config.telegram.chatId))
    }
    if (config.discord?.enabled && config.discord.webhookUrl) {
      strategies.push(new DiscordStrategy(config.discord.webhookUrl))
    }
    if (config.email?.enabled && config.email.host && config.email.to) {
      strategies.push(new EmailStrategy(config.email))
    }
    if (config.webhook?.enabled && config.webhook.url) {
      strategies.push(new WebhookStrategy(config.webhook.url, config.webhook.secret))
    }
    return strategies
  }
}
