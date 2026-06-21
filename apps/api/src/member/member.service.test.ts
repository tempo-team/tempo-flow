// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { BadRequestException } from "@nestjs/common"
import { describe, expect, it, vi } from "vitest"
import type { PrismaService } from "../prisma/prisma.service"
import { MemberService } from "./member.service"

function makePrisma(opts: {
  adminCount: number
  targetIsAdmin: boolean
  del?: ReturnType<typeof vi.fn>
}): PrismaService {
  return {
    user: {
      count: vi.fn().mockResolvedValue(opts.adminCount),
      findUnique: vi.fn().mockResolvedValue({
        id: "u1",
        roles: opts.targetIsAdmin ? [{ role: { name: "admin" } }] : [{ role: { name: "viewer" } }],
      }),
      delete: opts.del ?? vi.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService
}

describe("MemberService — last admin guard", () => {
  it("blocks deleting the last active admin", async () => {
    const del = vi.fn()
    const svc = new MemberService(makePrisma({ adminCount: 1, targetIsAdmin: true, del }))
    await expect(svc.remove("u1")).rejects.toBeInstanceOf(BadRequestException)
    expect(del).not.toHaveBeenCalled()
  })

  it("allows deleting an admin when another admin remains", async () => {
    const del = vi.fn().mockResolvedValue({})
    const svc = new MemberService(makePrisma({ adminCount: 2, targetIsAdmin: true, del }))
    await svc.remove("u1")
    expect(del).toHaveBeenCalledOnce()
  })

  it("allows deleting a non-admin even as the only admin exists elsewhere", async () => {
    const del = vi.fn().mockResolvedValue({})
    const svc = new MemberService(makePrisma({ adminCount: 1, targetIsAdmin: false, del }))
    await svc.remove("u1")
    expect(del).toHaveBeenCalledOnce()
  })
})
