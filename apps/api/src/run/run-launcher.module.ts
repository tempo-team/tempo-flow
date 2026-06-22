// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Module } from "@nestjs/common"
import { QueueModule } from "../queue/queue.module"
import { RunLauncherService } from "./run-launcher.service"

/** Shared launcher used by both RunModule (manual) and SchedulerModule (cron). */
@Module({
  imports: [QueueModule],
  providers: [RunLauncherService],
  exports: [RunLauncherService],
})
export class RunLauncherModule {}
