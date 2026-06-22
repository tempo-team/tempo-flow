// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Module } from "@nestjs/common"
import { QueueModule } from "../queue/queue.module"
import { RunLauncherModule } from "../run/run-launcher.module"
import { LockService } from "./lock.service"
import { SchedulerService } from "./scheduler.service"
import { SlaWatchdogService } from "./sla-watchdog.service"

@Module({
  imports: [RunLauncherModule, QueueModule],
  providers: [SchedulerService, LockService, SlaWatchdogService],
  exports: [SchedulerService, LockService],
})
export class SchedulerModule {}
