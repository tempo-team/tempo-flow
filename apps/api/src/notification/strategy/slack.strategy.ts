// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { IncomingWebhook } from "@slack/webhook"
import {
  type NotificationPayload,
  type NotificationStrategy,
  formatMessage,
} from "../notification.types"

/** Transport seam so tests can assert payloads without hitting Slack. */
export type SlackTransport = (webhookUrl: string, text: string) => Promise<void>

const defaultTransport: SlackTransport = async (webhookUrl, text) => {
  await new IncomingWebhook(webhookUrl).send({ text })
}

export class SlackStrategy implements NotificationStrategy {
  readonly channel = "slack"

  constructor(
    private readonly webhookUrl: string,
    private readonly transport: SlackTransport = defaultTransport,
  ) {}

  async send(payload: NotificationPayload): Promise<void> {
    await this.transport(this.webhookUrl, formatMessage(payload))
  }
}
