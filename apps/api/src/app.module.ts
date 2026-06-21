// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { EventEmitterModule } from "@nestjs/event-emitter"
import { AuthModule } from "./auth/auth.module"
import { AuthzModule } from "./authz/authz.module"
import { FlowModule } from "./flow/flow.module"
import { HealthController } from "./health.controller"
import { MemberModule } from "./member/member.module"
import { NotificationModule } from "./notification/notification.module"
import { PrismaModule } from "./prisma/prisma.module"
import { RedisModule } from "./redis/redis.module"
import { RunModule } from "./run/run.module"
import { SchedulerModule } from "./scheduler/scheduler.module"
import { SettingModule } from "./setting/setting.module"

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    RedisModule,
    AuthzModule,
    AuthModule,
    MemberModule,
    FlowModule,
    SchedulerModule,
    RunModule,
    SettingModule,
    NotificationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
