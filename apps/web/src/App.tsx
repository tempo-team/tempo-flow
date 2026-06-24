// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import type { Action, Resource } from "@tempo-flow/shared-types"
import { AppShell } from "./components/AppShell"
import { AuthProvider, useAuth } from "./lib/auth"
import { DashboardPage } from "./pages/DashboardPage"
import { FlowEditorPage } from "./pages/FlowEditorPage"
import { FlowPage } from "./pages/FlowPage"
import { IntegrationPage } from "./pages/IntegrationPage"
import { LoginPage } from "./pages/LoginPage"
import { MembersPage } from "./pages/MembersPage"
import { SettingsPage } from "./pages/SettingsPage"

function RequireAuth({
  children,
  requires,
}: {
  children: ReactNode
  /** Optional permission gate — redirects to home if the user lacks it (also hides URL access). */
  requires?: { action: Action; resource: Resource }
}) {
  const { user, loading, can } = useAuth()
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (requires && !can(requires.action, requires.resource)) return <Navigate to="/" replace />
  return <AppShell>{children}</AppShell>
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/flows/new"
            element={
              <RequireAuth>
                <FlowEditorPage />
              </RequireAuth>
            }
          />
          <Route
            path="/flows/:id/edit"
            element={
              <RequireAuth>
                <FlowEditorPage />
              </RequireAuth>
            }
          />
          <Route
            path="/flows/:id"
            element={
              <RequireAuth>
                <FlowPage />
              </RequireAuth>
            }
          />
          <Route
            path="/integration"
            element={
              <RequireAuth>
                <IntegrationPage />
              </RequireAuth>
            }
          />
          <Route
            path="/members"
            element={
              <RequireAuth requires={{ action: "manage", resource: "user" }}>
                <MembersPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth requires={{ action: "view", resource: "setting" }}>
                <SettingsPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
