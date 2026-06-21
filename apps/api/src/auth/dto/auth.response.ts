// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { AuthPrincipal, TokenPair } from "@tempo-flow/shared-types"

export class AuthResponse {
  accessToken!: string
  refreshToken!: string
  user!: {
    id: string
    email: string
    roles: string[]
    permissions: string[]
  }

  static from(tokens: TokenPair, principal: AuthPrincipal): AuthResponse {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: principal.userId,
        email: principal.email,
        roles: principal.roles,
        permissions: principal.permissions,
      },
    }
  }
}
