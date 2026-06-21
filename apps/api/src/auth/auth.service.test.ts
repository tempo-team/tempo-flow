// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { ConfigService } from "@nestjs/config"
import { JwtService } from "@nestjs/jwt"
import type { AccessTokenPayload } from "@tempo-flow/shared-types"
import bcrypt from "bcrypt"
import { describe, expect, it } from "vitest"
import type { PrismaService } from "../prisma/prisma.service"
import { AuthService } from "./auth.service"

const SECRETS: Record<string, string> = {
  JWT_ACCESS_SECRET: "access-secret",
  JWT_REFRESH_SECRET: "refresh-secret",
  JWT_ACCESS_TTL: "900s",
  JWT_REFRESH_TTL: "7d",
}

const config = { get: (key: string) => SECRETS[key] } as unknown as ConfigService
const jwt = new JwtService()

function makeUserRow(passwordHash: string) {
  return {
    id: "u1",
    email: "admin@x",
    passwordHash,
    active: true,
    roles: [
      {
        role: {
          name: "operator",
          permissions: [
            { permission: { action: "execute", resource: "flow" } },
            { permission: { action: "view", resource: "flow" } },
          ],
        },
      },
    ],
  }
}

function makePrisma(passwordHash: string): PrismaService {
  return {
    user: {
      findUnique: async () => makeUserRow(passwordHash),
    },
  } as unknown as PrismaService
}

describe("AuthService", () => {
  it("validates a correct password and flattens permissions", async () => {
    const hash = await bcrypt.hash("secret123", 10)
    const svc = new AuthService(makePrisma(hash), jwt, config)
    const principal = await svc.validateCredentials("admin@x", "secret123")
    expect(principal.roles).toEqual(["operator"])
    expect(principal.permissions.sort()).toEqual(["execute:flow", "view:flow"])
  })

  it("rejects a wrong password", async () => {
    const hash = await bcrypt.hash("secret123", 10)
    const svc = new AuthService(makePrisma(hash), jwt, config)
    await expect(svc.validateCredentials("admin@x", "wrong")).rejects.toThrow()
  })

  it("issues an access token carrying permissions", async () => {
    const svc = new AuthService(makePrisma("x"), jwt, config)
    const tokens = await svc.issueTokens({
      userId: "u1",
      email: "admin@x",
      roles: ["operator"],
      permissions: ["execute:flow"] as never,
    })
    const decoded = await jwt.verifyAsync<AccessTokenPayload>(tokens.accessToken, {
      secret: SECRETS.JWT_ACCESS_SECRET,
    })
    expect(decoded.sub).toBe("u1")
    expect(decoded.permissions).toContain("execute:flow")
  })

  it("refreshes tokens from a valid refresh token", async () => {
    const hash = await bcrypt.hash("secret123", 10)
    const svc = new AuthService(makePrisma(hash), jwt, config)
    const { tokens } = await svc.login("admin@x", "secret123")
    const refreshed = await svc.refresh(tokens.refreshToken)
    expect(refreshed.tokens.accessToken).toBeTruthy()
    expect(refreshed.principal.userId).toBe("u1")
  })

  it("rejects an access token used as a refresh token", async () => {
    const svc = new AuthService(makePrisma("x"), jwt, config)
    const tokens = await svc.issueTokens({
      userId: "u1",
      email: "admin@x",
      roles: [],
      permissions: [] as never,
    })
    await expect(svc.refresh(tokens.accessToken)).rejects.toThrow()
  })
})
