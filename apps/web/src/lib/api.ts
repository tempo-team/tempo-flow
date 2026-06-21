// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { FlowDefinition, FlowTrigger, Permission } from "@tempo-flow/shared-types"

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api"
const TOKEN_KEY = "tempo-flow.accessToken"

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set("content-type", "application/json")
  const token = getToken()
  if (token) headers.set("authorization", `Bearer ${token}`)

  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status}: ${body}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export interface AuthUser {
  id: string
  email: string
  roles: string[]
  permissions: Permission[]
}
export interface AuthResult {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

export interface FlowSummary {
  id: string
  name: string
  description: string | null
  enabled: boolean
  trigger: FlowTrigger
  definition: FlowDefinition
}

export interface FlowRunSummary {
  id: string
  flowId: string
  status: string
  trigger: string
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  nodeRuns?: {
    id: string
    nodeId: string
    status: string
    attempt: number
    executor: string
    errorMessage: string | null
  }[]
}

export const api = {
  login: (email: string, password: string) =>
    request<AuthResult>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<AuthUser>("/auth/me"),
  listFlows: () => request<FlowSummary[]>("/flows"),
  getFlow: (id: string) => request<FlowSummary>(`/flows/${id}`),
  runFlow: (id: string, body: { runDate?: string; params?: Record<string, string> }) =>
    request<FlowRunSummary>(`/flows/${id}/run`, { method: "POST", body: JSON.stringify(body) }),
  listRuns: (flowId: string) => request<FlowRunSummary[]>(`/flows/${flowId}/runs`),
  getRun: (id: string) => request<FlowRunSummary>(`/runs/${id}`),
  cancelRun: (id: string) => request<FlowRunSummary>(`/runs/${id}/cancel`, { method: "POST" }),
}
