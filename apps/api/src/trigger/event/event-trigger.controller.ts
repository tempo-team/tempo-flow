// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common"
import { Action, Resource } from "@tempo-flow/shared-types"
import { JwtAuthGuard } from "../../auth/jwt-auth.guard"
import { PermissionsGuard } from "../../authz/permissions.guard"
import { RequirePermission } from "../../authz/require-permission.decorator"
import { CreateEventTriggerRequest } from "../dto/event-trigger.request"
import { EventTriggerService } from "./event-trigger.service"

@Controller("flows/:id/event-triggers")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EventTriggerController {
  constructor(private readonly events: EventTriggerService) {}

  @Post()
  @RequirePermission(Action.Edit, Resource.Flow)
  create(@Param("id") flowId: string, @Body() body: CreateEventTriggerRequest) {
    return this.events.create(flowId, {
      source: body.source,
      topic: body.topic,
      filter: body.filter,
    })
  }

  @Get()
  @RequirePermission(Action.View, Resource.Flow)
  list(@Param("id") flowId: string) {
    return this.events.list(flowId)
  }

  @Delete(":triggerId")
  @RequirePermission(Action.Edit, Resource.Flow)
  @HttpCode(204)
  async remove(@Param("id") flowId: string, @Param("triggerId") triggerId: string): Promise<void> {
    await this.events.remove(flowId, triggerId)
  }
}
