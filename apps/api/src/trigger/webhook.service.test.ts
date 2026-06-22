// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { createHash, createHmac } from "node:crypto"
import { UnauthorizedException } from "@nestjs/common"
import { describe, expect, it, vi } from "vitest"
import { encryptSecret } from "../common/crypto"
import type { PrismaService } from "../prisma/prisma.service"
import type { RunLauncherService } from "../run/run-launcher.service"
import { WebhookService } from "./webhook.service"

const ENC = "test-encryption-key"
const sha = (v: string) => createHash("sha256").update(v).digest("hex")

function build(webhook: unknown) {
  const findUnique = vi.fn().mockResolvedValue(webhook)
  const launch = vi.fn().mockResolvedValue({ id: "run-1" })
  const prisma = { flowWebhook: { findUnique } } as unknown as PrismaService
  const launcher = { launch } as unknown as RunLauncherService
  const config = { get: () => ENC } as unknown as import("@nestjs/config").ConfigService
  return { svc: new WebhookService(prisma, launcher, config), launch, findUnique }
}

describe("WebhookService.trigger", () => {
  it("rejects an unknown token", async () => {
    const { svc } = build(null)
    await expect(svc.trigger("nope", Buffer.alloc(0), undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })

  it("rejects a disabled webhook", async () => {
    const { svc } = build({ flowId: "f1", enabled: false, secretEncrypted: null })
    await expect(svc.trigger("t", Buffer.alloc(0), undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })

  it("launches a webhook run and parses body params", async () => {
    const { svc, launch } = build({ flowId: "f1", enabled: true, secretEncrypted: null })
    const body = Buffer.from(JSON.stringify({ region: "kr", retries: 2 }))
    const res = await svc.trigger("t", body, undefined)
    expect(res).toEqual({ runId: "run-1" })
    expect(launch).toHaveBeenCalledWith({
      flowId: "f1",
      trigger: "webhook",
      params: { region: "kr", retries: "2" },
    })
  })

  it("requires a valid HMAC signature when a secret is set", async () => {
    const secret = "s3cr3t"
    const wh = { flowId: "f1", enabled: true, secretEncrypted: encryptSecret(secret, ENC) }
    const body = Buffer.from(JSON.stringify({ a: "1" }))
    const good = createHmac("sha256", secret).update(body).digest("hex")

    const { svc: s1 } = build(wh)
    await expect(s1.trigger("t", body, undefined)).rejects.toBeInstanceOf(UnauthorizedException)

    const { svc: s2 } = build(wh)
    await expect(s2.trigger("t", body, "deadbeef")).rejects.toBeInstanceOf(UnauthorizedException)

    const { svc: s3, launch } = build(wh)
    await s3.trigger("t", body, good)
    expect(launch).toHaveBeenCalledOnce()
  })

  it("looks up by sha256(token)", async () => {
    const { svc, findUnique } = build({ flowId: "f1", enabled: true, secretEncrypted: null })
    await svc.trigger("my-token", Buffer.alloc(0), undefined)
    expect(findUnique).toHaveBeenCalledWith({ where: { tokenHash: sha("my-token") } })
  })
})
