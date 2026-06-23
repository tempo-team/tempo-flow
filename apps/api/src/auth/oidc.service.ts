// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { randomBytes } from "node:crypto"
import { Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import type { TokenPair } from "@tempo-flow/shared-types"
import type { Redis } from "ioredis"
import { PrismaService } from "../prisma/prisma.service"
import { REDIS_CLIENT } from "../redis/redis.constants"
import { AuthService } from "./auth.service"

interface OidcDiscovery {
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
}

const STATE_TTL_SECONDS = 600

/**
 * OpenID Connect single sign-on (authorization-code flow, confidential client).
 * Enabled only when OIDC_ISSUER is set. Claims come from the userinfo endpoint
 * over the TLS back-channel; IdP groups map to tempo-flow roles, and users are
 * provisioned just-in-time. No password is stored for SSO users.
 */
@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name)
  private discoveryCache?: Promise<OidcDiscovery>

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  isEnabled(): boolean {
    return Boolean(this.config.get<string>("OIDC_ISSUER"))
  }

  private redirectUri(): string {
    const fallback = `${this.config.get<string>("PUBLIC_URL") ?? "http://localhost:3000"}/api/auth/oidc/callback`
    return this.config.get<string>("OIDC_REDIRECT_URI") ?? fallback
  }

  private discover(): Promise<OidcDiscovery> {
    if (!this.discoveryCache) {
      this.discoveryCache = (async () => {
        const issuer = (this.config.get<string>("OIDC_ISSUER") ?? "").replace(/\/$/, "")
        const res = await fetch(`${issuer}/.well-known/openid-configuration`)
        if (!res.ok) throw new Error(`OIDC discovery failed (${res.status})`)
        return (await res.json()) as OidcDiscovery
      })().catch((err) => {
        // Don't cache a transient failure — otherwise SSO stays broken until restart.
        this.discoveryCache = undefined
        throw err
      })
    }
    return this.discoveryCache
  }

  /** Build the IdP authorization URL and remember the CSRF state in Redis. */
  async authorizationUrl(): Promise<string> {
    const d = await this.discover()
    const state = randomBytes(16).toString("hex")
    await this.redis.set(`oidc:state:${state}`, "1", "EX", STATE_TTL_SECONDS)
    const url = new URL(d.authorization_endpoint)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("client_id", this.config.get<string>("OIDC_CLIENT_ID") ?? "")
    url.searchParams.set("redirect_uri", this.redirectUri())
    url.searchParams.set(
      "scope",
      this.config.get<string>("OIDC_SCOPES") ?? "openid profile email groups",
    )
    url.searchParams.set("state", state)
    return url.toString()
  }

  /** Exchange the code, provision the user, and issue our own JWT pair. */
  async handleCallback(code: string, state: string): Promise<TokenPair> {
    if (!code || !state || (await this.redis.del(`oidc:state:${state}`)) !== 1) {
      throw new UnauthorizedException("Invalid or expired OIDC state")
    }
    const d = await this.discover()

    const tokenRes = await fetch(d.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: this.redirectUri(),
        client_id: this.config.get<string>("OIDC_CLIENT_ID") ?? "",
        client_secret: this.config.get<string>("OIDC_CLIENT_SECRET") ?? "",
      }),
    })
    if (!tokenRes.ok) throw new UnauthorizedException("OIDC token exchange failed")
    const { access_token } = (await tokenRes.json()) as { access_token?: string }
    if (!access_token) throw new UnauthorizedException("OIDC: no access token")

    const uiRes = await fetch(d.userinfo_endpoint, {
      headers: { authorization: `Bearer ${access_token}` },
    })
    if (!uiRes.ok) throw new UnauthorizedException("OIDC userinfo failed")
    const claims = (await uiRes.json()) as Record<string, unknown>

    const email = typeof claims.email === "string" ? claims.email : undefined
    if (!email) throw new UnauthorizedException("OIDC: missing email claim")
    const groupsClaim = this.config.get<string>("OIDC_GROUPS_CLAIM") ?? "groups"
    const groups = Array.isArray(claims[groupsClaim]) ? (claims[groupsClaim] as string[]) : []

    const roles = this.mapRolesFromGroups(groups)
    const name = typeof claims.name === "string" ? claims.name : undefined
    const userId = await this.provisionUser(email, name, roles)
    this.logger.log(`OIDC login ${email} → roles [${roles.join(", ")}]`)
    return this.auth.issueTokens(await this.auth.loadPrincipal(userId))
  }

  /** Map IdP groups → role names via OIDC_ROLE_MAP, falling back to a default. */
  mapRolesFromGroups(groups: string[]): string[] {
    const map = this.roleMap()
    const roles = new Set<string>()
    for (const g of groups) if (map[g]) roles.add(map[g])
    if (roles.size === 0) {
      const def = this.config.get<string>("OIDC_DEFAULT_ROLE")
      if (def) roles.add(def)
    }
    return [...roles]
  }

  private roleMap(): Record<string, string> {
    try {
      return JSON.parse(this.config.get<string>("OIDC_ROLE_MAP") ?? "{}") as Record<string, string>
    } catch {
      return {}
    }
  }

  /**
   * Find-or-create the user by email. For SSO-managed users the IdP is the source
   * of truth, so their roles are made to match the mapped set. A pre-existing
   * *local* user (password-based, not provisioned by us) is NOT role-clobbered —
   * otherwise an admin who happens to share an email would be downgraded on SSO
   * login. Unknown role names are skipped. SSO users get an unusable password hash.
   */
  async provisionUser(
    email: string,
    name: string | undefined,
    roleNames: string[],
  ): Promise<string> {
    // Decide local-vs-SSO before writing; the write itself stays atomic (upsert)
    // so two concurrent first-logins can't collide on the unique email.
    const existing = await this.prisma.user.findUnique({ where: { email } })
    const oidcManaged = !existing || (existing.passwordHash ?? "").startsWith("oidc:")

    const user = await this.prisma.user.upsert({
      where: { email },
      create: {
        email,
        name: name ?? null,
        passwordHash: `oidc:${randomBytes(24).toString("hex")}`,
        active: true,
      },
      update: name ? { name } : {},
    })

    if (oidcManaged) {
      const roles = await this.prisma.role.findMany({ where: { name: { in: roleNames } } })
      await this.prisma.userRole.deleteMany({ where: { userId: user.id } })
      for (const role of roles) {
        await this.prisma.userRole.create({ data: { userId: user.id, roleId: role.id } })
      }
    }
    return user.id
  }
}
