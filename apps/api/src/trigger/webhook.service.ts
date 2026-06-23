// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { decryptSecret, encryptSecret, sha256Hex } from "../common/crypto"
import { PrismaService } from "../prisma/prisma.service"
import { RunLauncherService } from "../run/run-launcher.service"

export interface CreatedWebhook {
  id: string
  /** Raw token — shown to the caller ONCE, never stored or returned again. */
  token: string
  /** Raw HMAC secret (only when requested). Also shown once. */
  secret?: string
}

export interface WebhookSummary {
  id: string
  label: string | null
  enabled: boolean
  hasSecret: boolean
  createdAt: Date
}

@Injectable()
export class WebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly launcher: RunLauncherService,
    private readonly config: ConfigService,
  ) {}

  private encKey(): string {
    return this.config.get<string>("SETTINGS_ENCRYPTION_KEY") ?? "tempo-flow-dev-key"
  }

  async create(flowId: string, label?: string, withSecret?: boolean): Promise<CreatedWebhook> {
    const flow = await this.prisma.flow.findUnique({ where: { id: flowId } })
    if (!flow) throw new NotFoundException("Flow not found")

    const token = randomBytes(24).toString("base64url")
    const secret = withSecret ? randomBytes(24).toString("base64url") : undefined
    const row = await this.prisma.flowWebhook.create({
      data: {
        flowId,
        tokenHash: sha256Hex(token),
        secretEncrypted: secret ? encryptSecret(secret, this.encKey()) : null,
        label: label ?? null,
      },
    })
    return { id: row.id, token, secret }
  }

  async list(flowId: string): Promise<WebhookSummary[]> {
    const rows = await this.prisma.flowWebhook.findMany({
      where: { flowId },
      orderBy: { createdAt: "desc" },
    })
    return rows.map((w) => ({
      id: w.id,
      label: w.label,
      enabled: w.enabled,
      hasSecret: w.secretEncrypted !== null,
      createdAt: w.createdAt,
    }))
  }

  async remove(flowId: string, id: string): Promise<void> {
    const row = await this.prisma.flowWebhook.findUnique({ where: { id } })
    if (!row || row.flowId !== flowId) throw new NotFoundException("Webhook not found")
    await this.prisma.flowWebhook.delete({ where: { id } })
  }

  /**
   * Resolve a webhook by its token, verify the optional HMAC signature over the
   * raw request body, and launch a run. Throws 401 for unknown/disabled tokens
   * or bad signatures (no info leak about which).
   */
  async trigger(
    token: string,
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<{ runId: string }> {
    const webhook = await this.prisma.flowWebhook.findUnique({
      where: { tokenHash: sha256Hex(token) },
    })
    if (!webhook || !webhook.enabled) throw new UnauthorizedException("Invalid webhook token")

    if (webhook.secretEncrypted) {
      const secret = decryptSecret(webhook.secretEncrypted, this.encKey())
      const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
      if (!signature || !safeEqualHex(expected, signature)) {
        throw new UnauthorizedException("Invalid signature")
      }
    }

    const params = parseParams(rawBody)
    const run = await this.launcher.launch({ flowId: webhook.flowId, trigger: "webhook", params })
    return { runId: run.id }
  }
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex")
  const bb = Buffer.from(b, "hex")
  if (ba.length !== bb.length || ba.length === 0) return false
  return timingSafeEqual(ba, bb)
}

/** Top-level string fields of the JSON body become run params. */
function parseParams(rawBody: Buffer): Record<string, string> | undefined {
  if (rawBody.length === 0) return undefined
  let body: unknown
  try {
    body = JSON.parse(rawBody.toString("utf8"))
  } catch {
    return undefined
  }
  if (typeof body !== "object" || body === null) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === "string") out[k] = v
    else if (typeof v === "number" || typeof v === "boolean") out[k] = String(v)
  }
  return Object.keys(out).length > 0 ? out : undefined
}
