// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { AppShell } from "./components/AppShell"
import { AuthProvider, useAuth } from "./lib/auth"
import { DashboardPage } from "./pages/DashboardPage"
import { FlowEditorPage } from "./pages/FlowEditorPage"
import { FlowPage } from "./pages/FlowPage"
import { LoginPage } from "./pages/LoginPage"
import { MembersPage } from "./pages/MembersPage"
import { SettingsPage } from "./pages/SettingsPage"

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
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
            path="/members"
            element={
              <RequireAuth>
                <MembersPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
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
