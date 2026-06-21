// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Module } from "@nestjs/common"
import { QueueModule } from "../queue/queue.module"
import { LockService } from "./lock.service"
import { SchedulerService } from "./scheduler.service"

@Module({
  imports: [QueueModule],
  providers: [SchedulerService, LockService],
  exports: [SchedulerService, LockService],
})
export class SchedulerModule {}
