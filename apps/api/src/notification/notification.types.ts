// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

export type NotificationEvent = "failed" | "completed" | "retry_exhausted"

export interface NotificationPayload {
  event: NotificationEvent
  flowName: string
  flowRunId: string
  status: string
  message?: string
}

/** A pluggable notification channel (Slack, Telegram, ...). */
export interface NotificationStrategy {
  readonly channel: string
  send(payload: NotificationPayload): Promise<void>
}

const EVENT_LABEL: Record<NotificationEvent, string> = {
  failed: "❌ Flow failed",
  completed: "✅ Flow completed",
  retry_exhausted: "⚠️ Node retries exhausted",
}

/** Shared human-readable message used by all channels. */
export function formatMessage(p: NotificationPayload): string {
  const lines = [
    `${EVENT_LABEL[p.event]}: ${p.flowName}`,
    `Run: ${p.flowRunId}`,
    `Status: ${p.status}`,
  ]
  if (p.message) lines.push(p.message)
  return lines.join("\n")
}
