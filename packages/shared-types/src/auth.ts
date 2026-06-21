// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { Permission } from "./permissions.js"

/** Authenticated principal carried in the JWT access token and req.user. */
export interface AuthPrincipal {
  /** User id (JWT `sub`). */
  userId: string
  email: string
  roles: string[]
  /** Flattened `action:resource` permissions. */
  permissions: Permission[]
}

/** JWT access-token payload. */
export interface AccessTokenPayload {
  sub: string
  email: string
  roles: string[]
  permissions: Permission[]
}

/** JWT refresh-token payload (permissions reloaded on refresh). */
export interface RefreshTokenPayload {
  sub: string
  type: "refresh"
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}
