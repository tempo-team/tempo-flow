// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common"
import { CallbackService } from "./callback.service"
import { CallbackReportRequest } from "./dto/callback.request"

/**
 * Public completion-callback endpoints (token auth, no JWT). External batch jobs
 * report their result here so downstream nodes only run on the real success signal.
 */
@Controller("callbacks")
export class CallbackController {
  constructor(private readonly callbacks: CallbackService) {}

  @Post(":token")
  @HttpCode(200)
  report(@Param("token") token: string, @Body() body: CallbackReportRequest) {
    return this.callbacks.report(token, body)
  }

  @Post(":token/heartbeat")
  @HttpCode(200)
  heartbeat(@Param("token") token: string) {
    return this.callbacks.heartbeat(token)
  }

  @Get(":token")
  status(@Param("token") token: string) {
    return this.callbacks.status(token)
  }
}
