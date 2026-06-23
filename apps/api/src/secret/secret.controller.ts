// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common"
import { Action, type AuthPrincipal, Resource } from "@tempo-flow/shared-types"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { CurrentUser } from "../authz/current-user.decorator"
import { PermissionsGuard } from "../authz/permissions.guard"
import { RequirePermission } from "../authz/require-permission.decorator"
import { UpsertSecretRequest } from "./dto/secret.request"
import { SecretService } from "./secret.service"

@Controller("secrets")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SecretController {
  constructor(private readonly secrets: SecretService) {}

  @Get()
  @RequirePermission(Action.Manage, Resource.Secret)
  list(@Query("scope") scope?: string, @Query("flowId") flowId?: string) {
    return this.secrets.list(scope, flowId)
  }

  @Post()
  @RequirePermission(Action.Manage, Resource.Secret)
  create(@Body() body: UpsertSecretRequest, @CurrentUser() user: AuthPrincipal) {
    return this.secrets.upsert({ ...body, createdBy: user.userId })
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission(Action.Manage, Resource.Secret)
  async remove(@Param("id") id: string): Promise<void> {
    await this.secrets.remove(id)
  }
}
