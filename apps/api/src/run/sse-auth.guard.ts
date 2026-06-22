// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { JwtService } from "@nestjs/jwt"
import type { AccessTokenPayload } from "@tempo-flow/shared-types"
import type { Request } from "express"

/**
 * Auth for SSE streams. EventSource cannot set an Authorization header, so the
 * access token is accepted as a `?token=` query param (a Bearer header still
 * works for non-browser clients). Verified with the same JWT_ACCESS_SECRET.
 */
@Injectable()
export class SseAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>()
    const fromQuery = typeof req.query.token === "string" ? req.query.token : undefined
    const fromHeader = req.headers.authorization?.replace(/^Bearer\s+/i, "")
    const token = fromQuery ?? fromHeader
    if (!token) throw new UnauthorizedException("Missing token")
    try {
      const payload = this.jwt.verify<AccessTokenPayload>(token, {
        secret: this.config.get<string>("JWT_ACCESS_SECRET") ?? "change-me-access",
      })
      ;(req as Request & { user?: unknown }).user = {
        userId: payload.sub,
        email: payload.email,
        roles: payload.roles ?? [],
        permissions: payload.permissions ?? [],
      }
      return true
    } catch {
      throw new UnauthorizedException("Invalid token")
    }
  }
}
