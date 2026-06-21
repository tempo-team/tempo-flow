// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { Layout } from "./components/Layout"
import { AuthProvider, useAuth } from "./lib/auth"
import { DashboardPage } from "./pages/DashboardPage"
import { FlowPage } from "./pages/FlowPage"
import { LoginPage } from "./pages/LoginPage"

function RequireAuth({ children }: { children: ReactNode }): JSX.Element {
  const { user, loading } = useAuth()
  if (loading) return <p style={{ padding: 20 }}>Loading…</p>
  if (!user) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

export function App(): JSX.Element {
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
            path="/flows/:id"
            element={
              <RequireAuth>
                <FlowPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
