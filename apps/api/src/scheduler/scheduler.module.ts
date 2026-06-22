// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Module } from "@nestjs/common"
import { RunLauncherModule } from "../run/run-launcher.module"
import { LockService } from "./lock.service"
import { SchedulerService } from "./scheduler.service"

@Module({
  imports: [RunLauncherModule],
  providers: [SchedulerService, LockService],
  exports: [SchedulerService, LockService],
})
export class SchedulerModule {}
