// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger } from "@nestjs/common"
import { SettingService } from "../setting/setting.service"
import type { NotificationConfig } from "./notification.config"
import { NotificationFactory } from "./notification.factory"
import type { NotificationEvent, NotificationPayload } from "./notification.types"

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name)

  constructor(
    private readonly settings: SettingService,
    private readonly factory: NotificationFactory,
  ) {}

  async notify(payload: NotificationPayload): Promise<void> {
    const config = await this.settings.getConfig()
    if (!isEventEnabled(config, payload.event)) return

    const strategies = this.factory.build(config)
    await Promise.all(
      strategies.map((s) =>
        s
          .send(payload)
          .catch((err: Error) =>
            this.logger.error(`Notification via ${s.channel} failed: ${err.message}`),
          ),
      ),
    )
  }
}

export function isEventEnabled(config: NotificationConfig, event: NotificationEvent): boolean {
  switch (event) {
    case "failed":
      return config.events.failed
    case "completed":
      return config.events.completed
    case "retry_exhausted":
      return config.events.retryExhausted
  }
}
