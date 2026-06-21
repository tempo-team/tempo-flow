// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common"
import { Action, Resource } from "@tempo-flow/shared-types"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { PermissionsGuard } from "../authz/permissions.guard"
import { RequirePermission } from "../authz/require-permission.decorator"
import type { NotificationConfig } from "../notification/notification.config"
import { UpdateNotificationSettingsRequest } from "./dto/setting.request"
import { SettingService } from "./setting.service"

@Controller("settings")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SettingController {
  constructor(private readonly settings: SettingService) {}

  @Get("notifications")
  @RequirePermission(Action.View, Resource.Setting)
  getNotifications(): Promise<NotificationConfig> {
    return this.settings.getMaskedConfig()
  }

  @Put("notifications")
  @RequirePermission(Action.Manage, Resource.Setting)
  updateNotifications(
    @Body() body: UpdateNotificationSettingsRequest,
  ): Promise<NotificationConfig> {
    return this.settings.update(body)
  }
}
