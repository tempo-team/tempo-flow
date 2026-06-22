// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { createHmac } from "node:crypto"
import {
  type NotificationPayload,
  type NotificationStrategy,
  formatMessage,
} from "../notification.types"

export interface WebhookRequest {
  url: string
  headers: Record<string, string>
  body: string
}

/** Transport seam so tests can assert the request without making one. */
export type WebhookTransport = (req: WebhookRequest) => Promise<void>

const defaultTransport: WebhookTransport = async ({ url, headers, body }) => {
  await fetch(url, { method: "POST", headers, body })
}

/** Generic outbound webhook: POSTs the payload as JSON, optionally signed. */
export class WebhookStrategy implements NotificationStrategy {
  readonly channel = "webhook"

  constructor(
    private readonly url: string,
    private readonly secret: string,
    private readonly transport: WebhookTransport = defaultTransport,
  ) {}

  async send(payload: NotificationPayload): Promise<void> {
    const body = JSON.stringify({ ...payload, text: formatMessage(payload) })
    const headers: Record<string, string> = { "content-type": "application/json" }
    if (this.secret) {
      headers["x-tempo-signature"] = createHmac("sha256", this.secret).update(body).digest("hex")
    }
    await this.transport({ url: this.url, headers, body })
  }
}
