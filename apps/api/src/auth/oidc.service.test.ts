// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { ConfigService } from "@nestjs/config"
import type { Redis } from "ioredis"
import { describe, expect, it, vi } from "vitest"
import type { PrismaService } from "../prisma/prisma.service"
import type { AuthService } from "./auth.service"
import { OidcService } from "./oidc.service"

function build(env: Record<string, string>, prisma: Partial<PrismaService> = {}) {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService
  const auth = {} as AuthService
  const redis = {} as Redis
  return new OidcService(prisma as PrismaService, config, auth, redis)
}

describe("OidcService.mapRolesFromGroups", () => {
  const env = {
    OIDC_ROLE_MAP: JSON.stringify({ "tf-admins": "admin", "tf-ops": "operator" }),
    OIDC_DEFAULT_ROLE: "viewer",
  }

  it("maps matching IdP groups to roles", () => {
    const svc = build(env)
    expect(svc.mapRolesFromGroups(["tf-admins"])).toEqual(["admin"])
    expect(new Set(svc.mapRolesFromGroups(["tf-admins", "tf-ops"]))).toEqual(
      new Set(["admin", "operator"]),
    )
  })

  it("falls back to the default role when no group matches", () => {
    const svc = build(env)
    expect(svc.mapRolesFromGroups(["unknown"])).toEqual(["viewer"])
    expect(svc.mapRolesFromGroups([])).toEqual(["viewer"])
  })

  it("returns no roles when there is no match and no default", () => {
    const svc = build({ OIDC_ROLE_MAP: "{}" })
    expect(svc.mapRolesFromGroups(["x"])).toEqual([])
  })

  it("isEnabled reflects OIDC_ISSUER", () => {
    expect(build({}).isEnabled()).toBe(false)
    expect(build({ OIDC_ISSUER: "https://idp.example" }).isEnabled()).toBe(true)
  })
})

describe("OidcService.provisionUser", () => {
  it("creates a new user (random pw) and assigns the mapped roles", async () => {
    const findUnique = vi.fn().mockResolvedValue(null) // new user
    const userCreate = vi.fn().mockResolvedValue({ id: "u1" })
    const roleFindMany = vi.fn().mockResolvedValue([{ id: "r-admin" }])
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 })
    const create = vi.fn().mockResolvedValue({})
    const prisma = {
      user: { findUnique, create: userCreate },
      role: { findMany: roleFindMany },
      userRole: { deleteMany, create },
    } as unknown as PrismaService
    const svc = build({}, prisma)

    const id = await svc.provisionUser("a@b.com", "Alice", ["admin"])
    expect(id).toBe("u1")
    expect(userCreate.mock.calls[0][0].data.passwordHash).toMatch(/^oidc:/)
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } })
    expect(create).toHaveBeenCalledWith({ data: { userId: "u1", roleId: "r-admin" } })
  })

  it("does NOT clobber the roles of a pre-existing local (password) user", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "u9", passwordHash: "$2b$bcrypthash" })
    const userUpdate = vi.fn().mockResolvedValue({ id: "u9" })
    const deleteMany = vi.fn()
    const create = vi.fn()
    const prisma = {
      user: { findUnique, update: userUpdate },
      role: { findMany: vi.fn() },
      userRole: { deleteMany, create },
    } as unknown as PrismaService
    const svc = build({}, prisma)

    const id = await svc.provisionUser("admin@local", "Admin", ["viewer"])
    expect(id).toBe("u9")
    expect(deleteMany).not.toHaveBeenCalled() // local user's roles preserved
    expect(create).not.toHaveBeenCalled()
  })
})
