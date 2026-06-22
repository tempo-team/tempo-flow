// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
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
import { CreateFlowRequest, ImportFlowRequest, UpdateFlowRequest } from "./dto/flow.request"
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
  async update(
    @Param("id") id: string,
    @Body() body: UpdateFlowRequest,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<FlowResponse> {
    return FlowResponse.from(await this.flows.update(id, body, user.userId))
  }

  @Delete(":id")
  @RequirePermission(Action.Edit, Resource.Flow)
  @HttpCode(204)
  async remove(@Param("id") id: string): Promise<void> {
    await this.flows.remove(id)
  }

  @Get(":id/export")
  @RequirePermission(Action.View, Resource.Flow)
  @Header("content-type", "application/x-yaml")
  export(@Param("id") id: string): Promise<string> {
    return this.flows.exportYaml(id)
  }

  @Post("import")
  @RequirePermission(Action.Edit, Resource.Flow)
  async import(
    @Body() body: ImportFlowRequest,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<FlowResponse> {
    return FlowResponse.from(await this.flows.importYaml(body.yaml, user.userId))
  }

  @Get(":id/versions")
  @RequirePermission(Action.View, Resource.Flow)
  listVersions(@Param("id") id: string) {
    return this.flows.listVersions(id)
  }

  @Get(":id/versions/:version")
  @RequirePermission(Action.View, Resource.Flow)
  getVersion(@Param("id") id: string, @Param("version") version: string) {
    return this.flows.getVersion(id, Number(version))
  }

  @Post(":id/versions/:version/restore")
  @RequirePermission(Action.Edit, Resource.Flow)
  async restore(
    @Param("id") id: string,
    @Param("version") version: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<FlowResponse> {
    return FlowResponse.from(await this.flows.restore(id, Number(version), user.userId))
  }
}
