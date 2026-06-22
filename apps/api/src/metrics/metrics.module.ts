// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Module } from "@nestjs/common"
import { QueueModule } from "../queue/queue.module"
import { MetricsController } from "./metrics.controller"
import { MetricsService } from "./metrics.service"

@Module({
  imports: [QueueModule],
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {}
