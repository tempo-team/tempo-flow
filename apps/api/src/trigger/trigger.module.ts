// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Module } from "@nestjs/common"
import { RunLauncherModule } from "../run/run-launcher.module"
import { EventTriggerController } from "./event/event-trigger.controller"
import { EventTriggerService } from "./event/event-trigger.service"
import { RedisStreamAdapter } from "./event/redis-stream.adapter"
import { WebhookController } from "./webhook.controller"
import { WebhookService } from "./webhook.service"

@Module({
  imports: [RunLauncherModule],
  controllers: [WebhookController, EventTriggerController],
  providers: [WebhookService, EventTriggerService, RedisStreamAdapter],
})
export class TriggerModule {}
