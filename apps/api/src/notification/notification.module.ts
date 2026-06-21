// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Module } from "@nestjs/common"
import { SettingModule } from "../setting/setting.module"
import { NotificationFactory } from "./notification.factory"
import { NotificationListener } from "./notification.listener"
import { NotificationService } from "./notification.service"

@Module({
  imports: [SettingModule],
  providers: [NotificationFactory, NotificationService, NotificationListener],
  exports: [NotificationService],
})
export class NotificationModule {}
