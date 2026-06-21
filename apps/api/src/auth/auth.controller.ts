// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common"
import type { AuthPrincipal } from "@tempo-flow/shared-types"
import { CurrentUser } from "../authz/current-user.decorator"
import { AuthService } from "./auth.service"
import { AuthResponse } from "./dto/auth.response"
import { LoginRequest, RefreshRequest } from "./dto/login.request"
import { JwtAuthGuard } from "./jwt-auth.guard"

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(200)
  async login(@Body() body: LoginRequest): Promise<AuthResponse> {
    const { tokens, principal } = await this.auth.login(body.email, body.password)
    return AuthResponse.from(tokens, principal)
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(@Body() body: RefreshRequest): Promise<AuthResponse> {
    const { tokens, principal } = await this.auth.refresh(body.refreshToken)
    return AuthResponse.from(tokens, principal)
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthPrincipal): AuthPrincipal {
    return user
  }
}
