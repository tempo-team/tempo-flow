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
  Put,
  UseGuards,
} from "@nestjs/common"
import { Action, Resource } from "@tempo-flow/shared-types"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { PermissionsGuard } from "../authz/permissions.guard"
import { RequirePermission } from "../authz/require-permission.decorator"
import { CreateUserRequest, SetRolesRequest, UpdateUserRequest } from "./dto/member.request"
import { MemberResponse } from "./dto/member.response"
import { MemberService } from "./member.service"

@Controller("members")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission(Action.Manage, Resource.User)
export class MemberController {
  constructor(private readonly members: MemberService) {}

  @Get()
  async list(): Promise<MemberResponse[]> {
    const users = await this.members.list()
    return users.map(MemberResponse.from)
  }

  @Get("roles")
  listRoles() {
    return this.members.listRoles()
  }

  @Get(":id")
  async get(@Param("id") id: string): Promise<MemberResponse> {
    return MemberResponse.from(await this.members.get(id))
  }

  @Post()
  async create(@Body() body: CreateUserRequest): Promise<MemberResponse> {
    return MemberResponse.from(await this.members.create(body))
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: UpdateUserRequest): Promise<MemberResponse> {
    return MemberResponse.from(await this.members.update(id, body))
  }

  @Put(":id/roles")
  async setRoles(@Param("id") id: string, @Body() body: SetRolesRequest): Promise<MemberResponse> {
    return MemberResponse.from(await this.members.setRoles(id, body))
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@Param("id") id: string): Promise<void> {
    await this.members.remove(id)
  }
}
