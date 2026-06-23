// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Module } from "@nestjs/common"
import { QueueModule } from "../queue/queue.module"
import { SecretModule } from "../secret/secret.module"
import { CallbackController } from "./callback.controller"
import { CallbackService } from "./callback.service"

@Module({
  imports: [QueueModule, SecretModule],
  controllers: [CallbackController],
  providers: [CallbackService],
})
export class CallbackModule {}
