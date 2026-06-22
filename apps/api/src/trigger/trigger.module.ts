// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Module } from "@nestjs/common"
import { RunLauncherModule } from "../run/run-launcher.module"
import { WebhookController } from "./webhook.controller"
import { WebhookService } from "./webhook.service"

@Module({
  imports: [RunLauncherModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class TriggerModule {}
