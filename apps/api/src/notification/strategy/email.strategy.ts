// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { createTransport } from "nodemailer"
import type { EmailConfig } from "../notification.config"
import {
  type NotificationEvent,
  type NotificationPayload,
  type NotificationStrategy,
  formatMessage,
} from "../notification.types"

const SUBJECT: Record<NotificationEvent, string> = {
  failed: "Flow failed",
  completed: "Flow completed",
  retry_exhausted: "Node retries exhausted",
}

/** Transport seam so tests can assert mail without an SMTP server. */
export type EmailTransport = (cfg: EmailConfig, subject: string, text: string) => Promise<void>

const defaultTransport: EmailTransport = async (cfg, subject, text) => {
  const transporter = createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  })
  await transporter.sendMail({ from: cfg.from, to: cfg.to, subject, text })
}

export class EmailStrategy implements NotificationStrategy {
  readonly channel = "email"

  constructor(
    private readonly cfg: EmailConfig,
    private readonly transport: EmailTransport = defaultTransport,
  ) {}

  async send(payload: NotificationPayload): Promise<void> {
    const subject = `[tempo-flow] ${SUBJECT[payload.event]}: ${payload.flowName}`
    await this.transport(this.cfg, subject, formatMessage(payload))
  }
}
