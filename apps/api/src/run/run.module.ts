// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Module } from "@nestjs/common"
import { QueueModule } from "../queue/queue.module"
import { FlowProcessor } from "./flow.processor"
import { RunController } from "./run.controller"
import { RunLauncherModule } from "./run-launcher.module"
import { RunService } from "./run.service"

@Module({
  imports: [QueueModule, RunLauncherModule],
  controllers: [RunController],
  providers: [RunService, FlowProcessor],
  exports: [RunService],
})
export class RunModule {}
