// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import {
  type NotificationPayload,
  type NotificationStrategy,
  formatMessage,
} from "../notification.types"

/** Transport seam so tests can assert payloads without hitting Discord. */
export type DiscordTransport = (webhookUrl: string, content: string) => Promise<void>

const defaultTransport: DiscordTransport = async (webhookUrl, content) => {
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  })
}

export class DiscordStrategy implements NotificationStrategy {
  readonly channel = "discord"

  constructor(
    private readonly webhookUrl: string,
    private readonly transport: DiscordTransport = defaultTransport,
  ) {}

  async send(payload: NotificationPayload): Promise<void> {
    await this.transport(this.webhookUrl, formatMessage(payload))
  }
}
