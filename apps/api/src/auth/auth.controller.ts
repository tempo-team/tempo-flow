// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import type { AuthPrincipal } from "@tempo-flow/shared-types"
import type { Response } from "express"
import { CurrentUser } from "../authz/current-user.decorator"
import { AuthService } from "./auth.service"
import { AuthResponse } from "./dto/auth.response"
import { LoginRequest, RefreshRequest } from "./dto/login.request"
import { JwtAuthGuard } from "./jwt-auth.guard"
import { OidcService } from "./oidc.service"

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly oidc: OidcService,
    private readonly config: ConfigService,
  ) {}

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

  /** Whether SSO is configured (lets the web show the SSO button). */
  @Get("sso")
  ssoStatus(): { oidc: boolean } {
    return { oidc: this.oidc.isEnabled() }
  }

  /** Start the OIDC login (redirects to the IdP). */
  @Get("oidc/login")
  async oidcLogin(@Res() res: Response): Promise<void> {
    if (!this.oidc.isEnabled()) throw new NotFoundException("SSO not configured")
    res.redirect(await this.oidc.authorizationUrl())
  }

  /** IdP redirect target: exchange code, then hand the token back to the web. */
  @Get("oidc/callback")
  async oidcCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() res: Response,
  ): Promise<void> {
    const tokens = await this.oidc.handleCallback(code, state)
    const webUrl = (this.config.get<string>("WEB_URL") ?? "/").replace(/\/$/, "")
    res.redirect(`${webUrl}/?sso_token=${encodeURIComponent(tokens.accessToken)}`)
  }
}
