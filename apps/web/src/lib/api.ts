// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type {
  FlowDefinition,
  FlowTrigger,
  OverlapPolicy,
  Permission,
} from "@tempo-flow/shared-types"

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
  overlapPolicy?: OverlapPolicy
  slaMs?: number | null
  requiresApproval?: boolean
}

export interface NodeRunSummary {
  id: string
  nodeId: string
  status: string
  attempt: number
  executor: string
  request?: unknown
  response?: unknown
  errorMessage: string | null
  startedAt?: string | null
  finishedAt?: string | null
}

export interface FlowRunSummary {
  id: string
  flowId: string
  status: string
  trigger: string
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  nodeRuns?: NodeRunSummary[]
}

export interface FlowPayload {
  name: string
  description?: string
  definition: FlowDefinition
  trigger: FlowTrigger
  enabled?: boolean
  overlapPolicy?: OverlapPolicy
  slaMs?: number
  requiresApproval?: boolean
}

export interface MemberDto {
  id: string
  email: string
  name: string | null
  active: boolean
  roles: string[]
  createdAt: string
}
export interface RoleDto {
  id: string
  name: string
  description: string | null
}
export interface CreateMemberPayload {
  email: string
  password: string
  name?: string
  roles?: string[]
}
export interface UpdateMemberPayload {
  name?: string
  active?: boolean
  password?: string
}

export interface NotificationConfig {
  slack?: { enabled: boolean; webhookUrl: string }
  telegram?: { enabled: boolean; botToken: string; chatId: string }
  discord?: { enabled: boolean; webhookUrl: string }
  email?: {
    enabled: boolean
    host: string
    port: number
    secure: boolean
    user: string
    pass: string
    from: string
    to: string
  }
  webhook?: { enabled: boolean; url: string; secret: string }
  events: { failed: boolean; completed: boolean; retryExhausted: boolean }
}

export interface WebhookSummary {
  id: string
  label: string | null
  enabled: boolean
  hasSecret: boolean
  createdAt: string
}
export interface CreatedWebhook {
  id: string
  token: string
  secret?: string
}

export interface EventTrigger {
  id: string
  source: string
  topic: string
  filterJson: string | null
  enabled: boolean
  createdAt: string
}

export interface FlowVersion {
  id: string
  flowId: string
  version: number
  name: string
  description: string | null
  definition: string
  trigger: string
  createdBy: string | null
  createdAt: string
}

export const api = {
  login: (email: string, password: string) =>
    request<AuthResult>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<AuthUser>("/auth/me"),

  // --- flows ---
  listFlows: () => request<FlowSummary[]>("/flows"),
  getFlow: (id: string) => request<FlowSummary>(`/flows/${id}`),
  createFlow: (body: FlowPayload) =>
    request<FlowSummary>("/flows", { method: "POST", body: JSON.stringify(body) }),
  updateFlow: (id: string, body: Partial<FlowPayload>) =>
    request<FlowSummary>(`/flows/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteFlow: (id: string) => request<void>(`/flows/${id}`, { method: "DELETE" }),
  exportFlowYaml: async (id: string): Promise<string> => {
    const res = await fetch(`${BASE}/flows/${id}/export`, {
      headers: { authorization: `Bearer ${getToken() ?? ""}` },
    })
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
    return res.text()
  },
  importFlow: (yaml: string) =>
    request<FlowSummary>("/flows/import", { method: "POST", body: JSON.stringify({ yaml }) }),
  listVersions: (id: string) => request<FlowVersion[]>(`/flows/${id}/versions`),
  restoreVersion: (id: string, version: number) =>
    request<FlowSummary>(`/flows/${id}/versions/${version}/restore`, { method: "POST" }),

  // --- webhooks (triggers) ---
  listWebhooks: (flowId: string) => request<WebhookSummary[]>(`/flows/${flowId}/webhooks`),
  createWebhook: (flowId: string, body: { label?: string; withSecret?: boolean }) =>
    request<CreatedWebhook>(`/flows/${flowId}/webhooks`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteWebhook: (flowId: string, webhookId: string) =>
    request<void>(`/flows/${flowId}/webhooks/${webhookId}`, { method: "DELETE" }),

  // --- event triggers ---
  listEventTriggers: (flowId: string) => request<EventTrigger[]>(`/flows/${flowId}/event-triggers`),
  createEventTrigger: (flowId: string, body: { topic: string; filter?: Record<string, string> }) =>
    request<EventTrigger>(`/flows/${flowId}/event-triggers`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteEventTrigger: (flowId: string, triggerId: string) =>
    request<void>(`/flows/${flowId}/event-triggers/${triggerId}`, { method: "DELETE" }),

  // --- runs ---
  runFlow: (id: string, body: { runDate?: string; params?: Record<string, string> }) =>
    request<FlowRunSummary>(`/flows/${id}/run`, { method: "POST", body: JSON.stringify(body) }),
  backfill: (id: string, body: { from: string; to: string; stepHours?: number }) =>
    request<{ count: number }>(`/flows/${id}/backfill`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listRuns: (flowId: string) => request<FlowRunSummary[]>(`/flows/${flowId}/runs`),
  getRun: (id: string) => request<FlowRunSummary>(`/runs/${id}`),
  cancelRun: (id: string) => request<FlowRunSummary>(`/runs/${id}/cancel`, { method: "POST" }),
  approveRun: (id: string, note?: string) =>
    request<void>(`/runs/${id}/approve`, { method: "POST", body: JSON.stringify({ note }) }),
  rejectRun: (id: string, note?: string) =>
    request<void>(`/runs/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) }),

  // --- members ---
  listMembers: () => request<MemberDto[]>("/members"),
  listRoles: () => request<RoleDto[]>("/members/roles"),
  createMember: (body: CreateMemberPayload) =>
    request<MemberDto>("/members", { method: "POST", body: JSON.stringify(body) }),
  updateMember: (id: string, body: UpdateMemberPayload) =>
    request<MemberDto>(`/members/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  setMemberRoles: (id: string, roles: string[]) =>
    request<MemberDto>(`/members/${id}/roles`, { method: "PUT", body: JSON.stringify({ roles }) }),
  deleteMember: (id: string) => request<void>(`/members/${id}`, { method: "DELETE" }),

  // --- settings ---
  getNotificationSettings: () => request<NotificationConfig>("/settings/notifications"),
  updateNotificationSettings: (body: Partial<NotificationConfig>) =>
    request<NotificationConfig>("/settings/notifications", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  // --- sso ---
  ssoStatus: () => request<{ oidc: boolean }>("/auth/sso"),
  oidcLoginUrl: () => `${BASE}/auth/oidc/login`,

  // --- secrets (value is write-only; never returned) ---
  listSecrets: () => request<SecretSummary[]>("/secrets"),
  upsertSecret: (body: { key: string; value: string }) =>
    request<SecretSummary>("/secrets", { method: "POST", body: JSON.stringify(body) }),
  deleteSecret: (id: string) => request<void>(`/secrets/${id}`, { method: "DELETE" }),
}

export interface SecretSummary {
  id: string
  scope: string
  flowId: string
  key: string
  createdBy: string
  updatedAt: string
}
