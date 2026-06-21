// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

export interface NotificationConfig {
  slack?: { enabled: boolean; webhookUrl: string }
  telegram?: { enabled: boolean; botToken: string; chatId: string }
  events: { failed: boolean; completed: boolean; retryExhausted: boolean }
}

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  events: { failed: true, completed: false, retryExhausted: true },
}

export const NOTIFICATION_SETTING_KEY = "notifications"
