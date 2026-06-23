// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Seed default RBAC data + an initial admin user.
 *
 * Permission naming is `action:resource` and mirrors
 * packages/shared-types/src/permissions.ts. Roles:
 *   - admin    : everything
 *   - operator : run + view flows/history
 *   - viewer   : read-only
 *
 * Idempotent: safe to run repeatedly (uses upsert).
 */

import { PrismaClient } from "@prisma/client"
import bcrypt from "bcrypt"

const prisma = new PrismaClient()

type Perm = { action: string; resource: string }

const PERMISSIONS: Perm[] = [
  { action: "manage", resource: "flow" },
  { action: "edit", resource: "flow" },
  { action: "view", resource: "flow" },
  { action: "execute", resource: "flow" },
  { action: "manage", resource: "run" },
  { action: "view", resource: "run" },
  { action: "execute", resource: "run" },
  { action: "approve", resource: "run" },
  { action: "view", resource: "history" },
  { action: "manage", resource: "user" },
  { action: "manage", resource: "setting" },
  { action: "view", resource: "setting" },
  { action: "manage", resource: "secret" },
]

const ROLE_PERMISSIONS: Record<string, Perm[] | "all"> = {
  admin: "all",
  operator: [
    { action: "execute", resource: "flow" },
    { action: "view", resource: "flow" },
    { action: "execute", resource: "run" },
    { action: "view", resource: "run" },
    { action: "view", resource: "history" },
    { action: "view", resource: "setting" },
  ],
  approver: [
    { action: "view", resource: "flow" },
    { action: "view", resource: "run" },
    { action: "approve", resource: "run" },
    { action: "view", resource: "history" },
  ],
  viewer: [
    { action: "view", resource: "flow" },
    { action: "view", resource: "run" },
    { action: "view", resource: "history" },
    { action: "view", resource: "setting" },
  ],
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: "Full access to flows, runs, users, and settings",
  operator: "Execute and view flows, runs, and history",
  approver: "Approve or reject runs awaiting approval",
  viewer: "Read-only access",
}

function permKey(p: Perm): string {
  return `${p.action}:${p.resource}`
}

async function main(): Promise<void> {
  // Permissions
  const permByKey = new Map<string, string>()
  for (const p of PERMISSIONS) {
    const row = await prisma.permission.upsert({
      where: { action_resource: { action: p.action, resource: p.resource } },
      update: {},
      create: { action: p.action, resource: p.resource },
    })
    permByKey.set(permKey(p), row.id)
  }

  // Roles + role→permission links
  const roleIdByName = new Map<string, string>()
  for (const [name, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { description: ROLE_DESCRIPTIONS[name] },
      create: { name, description: ROLE_DESCRIPTIONS[name] },
    })
    roleIdByName.set(name, role.id)

    const grant = perms === "all" ? PERMISSIONS : perms
    for (const p of grant) {
      const permissionId = permByKey.get(permKey(p))
      if (!permissionId) continue
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      })
    }
  }

  // Default admin user
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@tempo-flow.local"
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin1234"
  const passwordHash = await bcrypt.hash(password, 10)
  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, name: "Administrator" },
  })
  const adminRoleId = roleIdByName.get("admin")!
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRoleId } },
    update: {},
    create: { userId: admin.id, roleId: adminRoleId },
  })

  console.info(`Seeded ${PERMISSIONS.length} permissions, ${roleIdByName.size} roles.`)
  console.info(`Admin user: ${email} (password from SEED_ADMIN_PASSWORD)`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err)
    await prisma.$disconnect()
    process.exit(1)
  })
