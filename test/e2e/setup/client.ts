// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// HTTP client helpers for driving the API as a black box. Never throws on
// non-2xx — returns { status, body } so tests can assert on 400/401/403/202/204.

import { ADMIN_EMAIL, ADMIN_PASSWORD, BASE_URL } from "./config"

export interface ApiResponse<T = unknown> {
  status: number
  body: T
  headers: Headers
}

export interface ApiClient {
  token: string
  request<T = unknown>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>>
  get<T = unknown>(path: string): Promise<ApiResponse<T>>
  post<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>>
  patch<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>>
  put<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>>
  del<T = unknown>(path: string): Promise<ApiResponse<T>>
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** Build a client bound to a bearer token (api paths are prefixed with /api). */
export function apiClient(token: string): ApiClient {
  const request = async <T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiResponse<T>> => {
    const headers: Record<string, string> = { authorization: `Bearer ${token}` }
    if (body !== undefined) headers["content-type"] = "application/json"
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    return { status: res.status, body: (await parse(res)) as T, headers: res.headers }
  }
  return {
    token,
    request,
    get: (p) => request("GET", p),
    post: (p, b) => request("POST", p, b),
    patch: (p, b) => request("PATCH", p, b),
    put: (p, b) => request("PUT", p, b),
    del: (p) => request("DELETE", p),
  }
}

interface LoginBody {
  accessToken: string
  refreshToken: string
  user: { id: string; email: string; roles: string[]; permissions: string[] }
}

/** Log in and return an access token (throws on failure). */
export async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as LoginBody
  return body.accessToken
}

let adminClientCache: ApiClient | undefined

/** Cached admin client (seeded admin user). */
export async function admin(): Promise<ApiClient> {
  if (!adminClientCache) adminClientCache = apiClient(await login(ADMIN_EMAIL, ADMIN_PASSWORD))
  return adminClientCache
}

let roleSeq = 0

/**
 * Create a user with the given seeded role(s) and return a client logged in as
 * them. Used by RBAC tests (operator/viewer/approver). Email is unique per call.
 */
export async function clientForRoles(roles: string[]): Promise<ApiClient> {
  const a = await admin()
  const email = `e2e+${roles.join("-")}-${roleSeq++}@tempo-flow.local`
  const password = "e2e-password"
  const created = await a.post("/api/members", { email, password, roles })
  if (created.status >= 300) {
    throw new Error(
      `createMember(${roles}) failed: ${created.status} ${JSON.stringify(created.body)}`,
    )
  }
  return apiClient(await login(email, password))
}

/** Drop the admin client cache (called on reset since users persist but tokens are fine). */
export function resetClientCache(): void {
  // Tokens remain valid across truncation (users are preserved), so we keep the
  // admin cache. Exposed for completeness / future use.
}
