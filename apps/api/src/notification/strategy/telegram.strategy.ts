// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Bot } from "grammy"
import {
  type NotificationPayload,
  type NotificationStrategy,
  formatMessage,
} from "../notification.types"

/** Transport seam so tests can assert payloads without hitting Telegram. */
export type TelegramTransport = (botToken: string, chatId: string, text: string) => Promise<void>

const defaultTransport: TelegramTransport = async (botToken, chatId, text) => {
  const bot = new Bot(botToken)
  await bot.api.sendMessage(chatId, text)
}

export class TelegramStrategy implements NotificationStrategy {
  readonly channel = "telegram"

  constructor(
    private readonly botToken: string,
    private readonly chatId: string,
    private readonly transport: TelegramTransport = defaultTransport,
  ) {}

  async send(payload: NotificationPayload): Promise<void> {
    await this.transport(this.botToken, this.chatId, formatMessage(payload))
  }
}
