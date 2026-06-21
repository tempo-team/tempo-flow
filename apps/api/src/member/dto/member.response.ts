// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

export class MemberResponse {
  id!: string
  email!: string
  name!: string | null
  active!: boolean
  roles!: string[]
  createdAt!: string

  static from(user: {
    id: string
    email: string
    name: string | null
    active: boolean
    createdAt: Date
    roles: { role: { name: string } }[]
  }): MemberResponse {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      active: user.active,
      roles: user.roles.map((r) => r.role.name),
      createdAt: user.createdAt.toISOString(),
    }
  }
}
