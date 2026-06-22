// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { createHmac } from "node:crypto"
import { describe, expect, it, vi } from "vitest"
import type { NotificationConfig } from "../notification.config"
import { NotificationFactory } from "../notification.factory"
import type { NotificationPayload } from "../notification.types"
import { DiscordStrategy } from "./discord.strategy"
import { WebhookStrategy } from "./webhook.strategy"

const payload: NotificationPayload = {
  event: "failed",
  flowName: "nightly",
  flowRunId: "run-1",
  status: "FAILED",
}

describe("DiscordStrategy", () => {
  it("posts the formatted message as content", async () => {
    const transport = vi.fn().mockResolvedValue(undefined)
    await new DiscordStrategy("https://discord/webhook", transport).send(payload)
    expect(transport).toHaveBeenCalledWith(
      "https://discord/webhook",
      expect.stringContaining("nightly"),
    )
  })
})

describe("WebhookStrategy", () => {
  it("signs the body with HMAC when a secret is set", async () => {
    const transport = vi.fn().mockResolvedValue(undefined)
    await new WebhookStrategy("https://hook", "s3cret", transport).send(payload)
    const req = transport.mock.calls[0][0]
    const expected = createHmac("sha256", "s3cret").update(req.body).digest("hex")
    expect(req.headers["x-tempo-signature"]).toBe(expected)
    expect(JSON.parse(req.body)).toMatchObject({ flowRunId: "run-1", event: "failed" })
  })

  it("omits the signature header without a secret", async () => {
    const transport = vi.fn().mockResolvedValue(undefined)
    await new WebhookStrategy("https://hook", "", transport).send(payload)
    expect(transport.mock.calls[0][0].headers["x-tempo-signature"]).toBeUndefined()
  })
})

describe("NotificationFactory", () => {
  it("builds a strategy per enabled+configured channel", () => {
    const config: NotificationConfig = {
      slack: { enabled: true, webhookUrl: "https://slack" },
      telegram: { enabled: false, botToken: "t", chatId: "c" },
      discord: { enabled: true, webhookUrl: "https://discord" },
      email: {
        enabled: true,
        host: "smtp",
        port: 587,
        secure: false,
        user: "u",
        pass: "p",
        from: "f",
        to: "t@x",
      },
      webhook: { enabled: true, url: "https://hook", secret: "" },
      events: { failed: true, completed: false, retryExhausted: true },
    }
    const channels = new NotificationFactory().build(config).map((s) => s.channel)
    expect(channels.sort()).toEqual(["discord", "email", "slack", "webhook"])
  })
})
