// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from "@nestjs/common"
import type { NotificationConfig } from "./notification.config"
import { SlackStrategy } from "./strategy/slack.strategy"
import { TelegramStrategy } from "./strategy/telegram.strategy"
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
    return strategies
  }
}
