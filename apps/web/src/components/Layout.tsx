// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "../lib/auth"

export function Layout({ children }: { children: ReactNode }): JSX.Element {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "12px 20px",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <Link
          to="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontWeight: 700,
            textDecoration: "none",
            color: "#0f172a",
          }}
        >
          <img src="/icon-32.png" alt="" width={24} height={24} />
          tempo-flow
        </Link>
        <nav style={{ display: "flex", gap: 12, flex: 1 }}>
          <Link to="/">Flows</Link>
        </nav>
        <span style={{ color: "#64748b", fontSize: 14 }}>
          {user?.email} ({user?.roles.join(", ")})
        </span>
        <button
          onClick={() => {
            logout()
            navigate("/login")
          }}
        >
          Logout
        </button>
      </header>
      <main style={{ padding: 20 }}>{children}</main>
    </div>
  )
}
