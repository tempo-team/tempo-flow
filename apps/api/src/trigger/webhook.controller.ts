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
  type RawBodyRequest,
  Req,
  UseGuards,
} from "@nestjs/common"
import { Action, Resource } from "@tempo-flow/shared-types"
import type { Request } from "express"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { PermissionsGuard } from "../authz/permissions.guard"
import { RequirePermission } from "../authz/require-permission.decorator"
import { CreateWebhookRequest } from "./dto/webhook.request"
import { WebhookRateLimitGuard } from "./webhook-rate-limit.guard"
import { WebhookService } from "./webhook.service"

const SIGNATURE_HEADER = "x-tempo-signature"

@Controller()
export class WebhookController {
  constructor(private readonly webhooks: WebhookService) {}

  // --- public trigger endpoint (token auth, no JWT) ---
  @Post("hooks/:token")
  @UseGuards(WebhookRateLimitGuard)
  @HttpCode(202)
  async trigger(
    @Param("token") token: string,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ runId: string }> {
    const signature = req.headers[SIGNATURE_HEADER] as string | undefined
    return this.webhooks.trigger(token, req.rawBody ?? Buffer.alloc(0), signature)
  }

  // --- management (authenticated) ---
  @Post("flows/:id/webhooks")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Action.Edit, Resource.Flow)
  create(@Param("id") flowId: string, @Body() body: CreateWebhookRequest) {
    return this.webhooks.create(flowId, body.label, body.withSecret)
  }

  @Get("flows/:id/webhooks")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Action.View, Resource.Flow)
  list(@Param("id") flowId: string) {
    return this.webhooks.list(flowId)
  }

  @Delete("flows/:id/webhooks/:webhookId")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(Action.Edit, Resource.Flow)
  @HttpCode(204)
  async remove(@Param("id") flowId: string, @Param("webhookId") webhookId: string): Promise<void> {
    await this.webhooks.remove(flowId, webhookId)
  }
}
