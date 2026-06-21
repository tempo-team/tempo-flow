// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Injectable, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { JwtService, type JwtSignOptions } from "@nestjs/jwt"
import type {
  AccessTokenPayload,
  AuthPrincipal,
  Permission,
  RefreshTokenPayload,
  TokenPair,
} from "@tempo-flow/shared-types"
import bcrypt from "bcrypt"
import { PrismaService } from "../prisma/prisma.service"

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Validate credentials and return the authenticated principal. */
  async validateCredentials(email: string, password: string): Promise<AuthPrincipal> {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user || !user.active) throw new UnauthorizedException("Invalid credentials")
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) throw new UnauthorizedException("Invalid credentials")
    return this.loadPrincipal(user.id)
  }

  /** Load a user's principal (roles + flattened permissions) from the DB. */
  async loadPrincipal(userId: string): Promise<AuthPrincipal> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    })
    if (!user || !user.active) throw new UnauthorizedException("User not found or inactive")

    const roles = user.roles.map((ur) => ur.role.name)
    const permSet = new Set<Permission>()
    for (const ur of user.roles) {
      for (const rp of ur.role.permissions) {
        permSet.add(`${rp.permission.action}:${rp.permission.resource}` as Permission)
      }
    }
    return { userId: user.id, email: user.email, roles, permissions: [...permSet] }
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ tokens: TokenPair; principal: AuthPrincipal }> {
    const principal = await this.validateCredentials(email, password)
    return { tokens: await this.issueTokens(principal), principal }
  }

  async refresh(refreshToken: string): Promise<{ tokens: TokenPair; principal: AuthPrincipal }> {
    let payload: RefreshTokenPayload
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.config.get<string>("JWT_REFRESH_SECRET"),
      })
    } catch {
      throw new UnauthorizedException("Invalid refresh token")
    }
    if (payload.type !== "refresh") throw new UnauthorizedException("Invalid refresh token")
    const principal = await this.loadPrincipal(payload.sub)
    return { tokens: await this.issueTokens(principal), principal }
  }

  async issueTokens(principal: AuthPrincipal): Promise<TokenPair> {
    const accessPayload: AccessTokenPayload = {
      sub: principal.userId,
      email: principal.email,
      roles: principal.roles,
      permissions: principal.permissions,
    }
    const refreshPayload: RefreshTokenPayload = { sub: principal.userId, type: "refresh" }

    const accessOpts = {
      secret: this.config.get<string>("JWT_ACCESS_SECRET"),
      expiresIn: this.config.get<string>("JWT_ACCESS_TTL") ?? "900s",
    } as JwtSignOptions
    const refreshOpts = {
      secret: this.config.get<string>("JWT_REFRESH_SECRET"),
      expiresIn: this.config.get<string>("JWT_REFRESH_TTL") ?? "7d",
    } as JwtSignOptions

    const accessToken = await this.jwt.signAsync(accessPayload, accessOpts)
    const refreshToken = await this.jwt.signAsync(refreshPayload, refreshOpts)
    return { accessToken, refreshToken }
  }
}
