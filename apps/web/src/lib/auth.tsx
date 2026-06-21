// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react"
import type { Action, Permission, Resource } from "@tempo-flow/shared-types"
import { type AuthUser, api, getToken, setToken } from "./api"

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  can: (action: Action, resource: Resource) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** True if the user holds `action:resource`, treating `manage` as a wildcard. */
export function hasPermission(
  permissions: Permission[],
  action: Action,
  resource: Resource,
): boolean {
  return (
    permissions.includes(`${action}:${resource}` as Permission) ||
    permissions.includes(`manage:${resource}` as Permission)
  )
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!getToken()) {
      setLoading(false)
      return
    }
    api
      .me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false))
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (email, password) => {
        const result = await api.login(email, password)
        setToken(result.accessToken)
        setUser(result.user)
      },
      logout: () => {
        setToken(null)
        setUser(null)
      },
      can: (action, resource) => (user ? hasPermission(user.permissions, action, resource) : false),
    }),
    [user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
