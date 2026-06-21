// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common"
import { Action, type AuthPrincipal, Resource } from "@tempo-flow/shared-types"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { CurrentUser } from "../authz/current-user.decorator"
import { PermissionsGuard } from "../authz/permissions.guard"
import { RequirePermission } from "../authz/require-permission.decorator"
import { CreateFlowRequest, UpdateFlowRequest } from "./dto/flow.request"
import { FlowResponse } from "./dto/flow.response"
import { FlowService } from "./flow.service"

@Controller("flows")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FlowController {
  constructor(private readonly flows: FlowService) {}

  @Get()
  @RequirePermission(Action.View, Resource.Flow)
  async list(): Promise<FlowResponse[]> {
    const flows = await this.flows.list()
    return flows.map(FlowResponse.from)
  }

  @Get(":id")
  @RequirePermission(Action.View, Resource.Flow)
  async get(@Param("id") id: string): Promise<FlowResponse> {
    return FlowResponse.from(await this.flows.get(id))
  }

  @Post()
  @RequirePermission(Action.Edit, Resource.Flow)
  async create(
    @Body() body: CreateFlowRequest,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<FlowResponse> {
    return FlowResponse.from(await this.flows.create(body, user.userId))
  }

  @Patch(":id")
  @RequirePermission(Action.Edit, Resource.Flow)
  async update(@Param("id") id: string, @Body() body: UpdateFlowRequest): Promise<FlowResponse> {
    return FlowResponse.from(await this.flows.update(id, body))
  }

  @Delete(":id")
  @RequirePermission(Action.Edit, Resource.Flow)
  @HttpCode(204)
  async remove(@Param("id") id: string): Promise<void> {
    await this.flows.remove(id)
  }
}
