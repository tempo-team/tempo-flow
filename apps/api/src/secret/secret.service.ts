// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { decryptSecret, encryptSecret } from "../common/crypto"
import { PrismaService } from "../prisma/prisma.service"
import type { UpsertSecretRequest } from "./dto/secret.request"

/** Metadata only — the secret value is never returned. */
const METADATA = {
  id: true,
  scope: true,
  flowId: true,
  key: true,
  createdBy: true,
  updatedAt: true,
} as const

/**
 * Manages named secrets stored AES-256-GCM encrypted at rest. Values are
 * write-only over the API; only the run worker decrypts them (resolveForFlow)
 * to inject into node executions.
 */
@Injectable()
export class SecretService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private masterKey(): string {
    return this.config.get<string>("SETTINGS_ENCRYPTION_KEY") ?? "0123456789abcdef0123456789abcdef"
  }

  list(scope = "global", flowId = "") {
    return this.prisma.secret.findMany({
      where: { scope, flowId },
      select: METADATA,
      orderBy: { key: "asc" },
    })
  }

  upsert(input: UpsertSecretRequest & { createdBy: string }) {
    const scope = input.scope ?? "global"
    const flowId = scope === "flow" ? (input.flowId ?? "") : ""
    const valueEnc = encryptSecret(input.value, this.masterKey())
    return this.prisma.secret.upsert({
      where: { scope_flowId_key: { scope, flowId, key: input.key } },
      create: { scope, flowId, key: input.key, valueEnc, createdBy: input.createdBy },
      update: { valueEnc, createdBy: input.createdBy },
      select: METADATA,
    })
  }

  async remove(id: string): Promise<void> {
    await this.prisma.secret.delete({ where: { id } }).catch(() => undefined)
  }

  /**
   * Decrypt every secret applicable to a flow (global + flow-scoped, the latter
   * overriding by key). Worker-only — the returned plaintext is injected into
   * node executions and never persisted or returned to clients.
   */
  async resolveForFlow(flowId: string): Promise<Record<string, string>> {
    const rows = await this.prisma.secret.findMany({
      where: {
        OR: [
          { scope: "global", flowId: "" },
          { scope: "flow", flowId },
        ],
      },
    })
    const key = this.masterKey()
    const out: Record<string, string> = {}
    for (const r of rows.filter((r) => r.scope === "global"))
      out[r.key] = decryptSecret(r.valueEnc, key)
    for (const r of rows.filter((r) => r.scope === "flow"))
      out[r.key] = decryptSecret(r.valueEnc, key)
    return out
  }
}
