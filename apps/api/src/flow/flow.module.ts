// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Module } from "@nestjs/common"
import { SchedulerModule } from "../scheduler/scheduler.module"
import { FlowController } from "./flow.controller"
import { FlowService } from "./flow.service"

@Module({
  imports: [SchedulerModule],
  controllers: [FlowController],
  providers: [FlowService],
  exports: [FlowService],
})
export class FlowModule {}
