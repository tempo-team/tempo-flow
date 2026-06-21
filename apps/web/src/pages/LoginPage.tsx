// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { type FormEvent, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../lib/auth"

export function LoginPage(): JSX.Element {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState("admin@tempo-flow.local")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
      navigate("/")
    } catch {
      setError("Invalid credentials")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <form onSubmit={onSubmit} style={{ width: 320, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/icon-64.png" alt="tempo-flow" width={40} height={40} />
          <h1 style={{ margin: 0 }}>tempo-flow</h1>
        </div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          required
        />
        {error && <p style={{ color: "#dc2626", margin: 0 }}>{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  )
}
