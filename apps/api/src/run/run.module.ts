// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Module } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { JwtModule } from "@nestjs/jwt"
import { QueueModule } from "../queue/queue.module"
import { FlowProcessor } from "./flow.processor"
import { RunController } from "./run.controller"
import { RunLauncherModule } from "./run-launcher.module"
import { RunStreamController } from "./run-stream.controller"
import { RunService } from "./run.service"
import { SseAuthGuard } from "./sse-auth.guard"

@Module({
  imports: [
    QueueModule,
    RunLauncherModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_ACCESS_SECRET") ?? "change-me-access",
      }),
    }),
  ],
  controllers: [RunController, RunStreamController],
  providers: [RunService, FlowProcessor, SseAuthGuard],
  exports: [RunService],
})
export class RunModule {}
