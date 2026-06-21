// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import bcrypt from "bcrypt"
import { PrismaService } from "../prisma/prisma.service"
import type { CreateUserRequest, SetRolesRequest, UpdateUserRequest } from "./dto/member.request"

const userInclude = { roles: { include: { role: true } } } as const
const ADMIN_ROLE = "admin"

@Injectable()
export class MemberService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({ include: userInclude, orderBy: { createdAt: "asc" } })
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: userInclude })
    if (!user) throw new NotFoundException("User not found")
    return user
  }

  listRoles() {
    return this.prisma.role.findMany({ orderBy: { name: "asc" } })
  }

  async create(input: CreateUserRequest) {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email } })
    if (exists) throw new ConflictException("Email already in use")

    const passwordHash = await bcrypt.hash(input.password, 10)
    const roleIds = await this.resolveRoleIds(input.roles ?? [])

    return this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        roles: { create: roleIds.map((roleId) => ({ roleId })) },
      },
      include: userInclude,
    })
  }

  async update(id: string, input: UpdateUserRequest) {
    await this.get(id)
    if (input.active === false) await this.assertNotLastActiveAdmin(id)
    const data: Record<string, unknown> = {}
    if (input.name !== undefined) data.name = input.name
    if (input.active !== undefined) data.active = input.active
    if (input.password !== undefined) data.passwordHash = await bcrypt.hash(input.password, 10)
    return this.prisma.user.update({ where: { id }, data, include: userInclude })
  }

  async remove(id: string): Promise<void> {
    await this.get(id)
    await this.assertNotLastActiveAdmin(id)
    await this.prisma.user.delete({ where: { id } })
  }

  async setRoles(id: string, input: SetRolesRequest) {
    await this.get(id)
    if (!input.roles.includes(ADMIN_ROLE)) await this.assertNotLastActiveAdmin(id)
    const roleIds = await this.resolveRoleIds(input.roles)
    await this.prisma.userRole.deleteMany({ where: { userId: id } })
    await this.prisma.userRole.createMany({
      data: roleIds.map((roleId) => ({ userId: id, roleId })),
    })
    return this.get(id)
  }

  /** Guard against locking everyone out by removing/demoting the last admin. */
  private async assertNotLastActiveAdmin(userId: string): Promise<void> {
    const admins = await this.prisma.user.count({
      where: { active: true, roles: { some: { role: { name: ADMIN_ROLE } } } },
    })
    if (admins > 1) return
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      include: userInclude,
    })
    const isAdmin = target?.roles.some((r) => r.role.name === ADMIN_ROLE) ?? false
    if (isAdmin) {
      throw new BadRequestException("Cannot remove or demote the last active admin")
    }
  }

  private async resolveRoleIds(roleNames: string[]): Promise<string[]> {
    if (roleNames.length === 0) return []
    const roles = await this.prisma.role.findMany({ where: { name: { in: roleNames } } })
    const found = new Set(roles.map((r) => r.name))
    const missing = roleNames.filter((n) => !found.has(n))
    if (missing.length > 0) throw new NotFoundException(`Unknown roles: ${missing.join(", ")}`)
    return roles.map((r) => r.id)
  }
}
