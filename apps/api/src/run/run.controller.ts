// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common"
import { Action, type AuthPrincipal, Resource } from "@tempo-flow/shared-types"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { CurrentUser } from "../authz/current-user.decorator"
import { PermissionsGuard } from "../authz/permissions.guard"
import { RequirePermission } from "../authz/require-permission.decorator"
import { ApprovalDecisionRequest, ManualRunRequest } from "./dto/run.request"
import { FlowRunResponse } from "./dto/run.response"
import { RunLauncherService } from "./run-launcher.service"
import { RunService } from "./run.service"

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RunController {
  constructor(
    private readonly runs: RunService,
    private readonly launcher: RunLauncherService,
  ) {}

  @Get("flows/:flowId/runs")
  @RequirePermission(Action.View, Resource.Run)
  async list(@Param("flowId") flowId: string): Promise<FlowRunResponse[]> {
    const runs = await this.runs.listRuns(flowId)
    return runs.map(FlowRunResponse.from)
  }

  @Get("runs/:id")
  @RequirePermission(Action.View, Resource.Run)
  async get(@Param("id") id: string): Promise<FlowRunResponse> {
    return FlowRunResponse.from(await this.runs.getRun(id))
  }

  @Post("flows/:flowId/run")
  @RequirePermission(Action.Execute, Resource.Flow)
  async run(
    @Param("flowId") flowId: string,
    @Body() body: ManualRunRequest,
  ): Promise<FlowRunResponse> {
    return FlowRunResponse.from(await this.runs.manualRun(flowId, body))
  }

  @Post("runs/:id/cancel")
  @RequirePermission(Action.Execute, Resource.Run)
  @HttpCode(200)
  async cancel(@Param("id") id: string): Promise<FlowRunResponse> {
    return FlowRunResponse.from(await this.runs.cancel(id))
  }

  @Post("runs/:id/approve")
  @RequirePermission(Action.Approve, Resource.Run)
  @HttpCode(204)
  async approve(
    @Param("id") id: string,
    @Body() body: ApprovalDecisionRequest,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<void> {
    await this.launcher.approve(id, user.userId, body.note)
  }

  @Post("runs/:id/reject")
  @RequirePermission(Action.Approve, Resource.Run)
  @HttpCode(204)
  async reject(
    @Param("id") id: string,
    @Body() body: ApprovalDecisionRequest,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<void> {
    await this.launcher.reject(id, user.userId, body.note)
  }
}
