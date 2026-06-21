// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest"
import type { SettingService } from "../setting/setting.service"
import type { NotificationConfig } from "./notification.config"
import { NotificationFactory } from "./notification.factory"
import { NotificationService, isEventEnabled } from "./notification.service"
import type { NotificationPayload, NotificationStrategy } from "./notification.types"
import { SlackStrategy } from "./strategy/slack.strategy"
import { TelegramStrategy } from "./strategy/telegram.strategy"

const payload: NotificationPayload = {
  event: "failed",
  flowName: "nightly",
  flowRunId: "run-1",
  status: "FAILED",
}

describe("strategies", () => {
  it("SlackStrategy posts a formatted message to the webhook", async () => {
    const transport = vi.fn(async (_url: string, _text: string) => {})
    await new SlackStrategy("https://hook", transport).send(payload)
    expect(transport).toHaveBeenCalledWith("https://hook", expect.stringContaining("nightly"))
    expect(transport.mock.calls[0][1]).toContain("FAILED")
  })

  it("TelegramStrategy sends to the chat id", async () => {
    const transport = vi.fn(async (_token: string, _chatId: string, _text: string) => {})
    await new TelegramStrategy("token", "chat-42", transport).send(payload)
    expect(transport).toHaveBeenCalledWith("token", "chat-42", expect.stringContaining("nightly"))
  })
})

describe("NotificationFactory", () => {
  const factory = new NotificationFactory()

  it("builds enabled channels only", () => {
    const config: NotificationConfig = {
      slack: { enabled: true, webhookUrl: "https://hook" },
      telegram: { enabled: false, botToken: "t", chatId: "c" },
      events: { failed: true, completed: false, retryExhausted: true },
    }
    const built = factory.build(config)
    expect(built.map((s) => s.channel)).toEqual(["slack"])
  })

  it("skips channels missing secrets", () => {
    const config: NotificationConfig = {
      slack: { enabled: true, webhookUrl: "" },
      events: { failed: true, completed: false, retryExhausted: true },
    }
    expect(factory.build(config)).toHaveLength(0)
  })
})

describe("isEventEnabled", () => {
  const config: NotificationConfig = {
    events: { failed: true, completed: false, retryExhausted: true },
  }
  it("gates by event type", () => {
    expect(isEventEnabled(config, "failed")).toBe(true)
    expect(isEventEnabled(config, "completed")).toBe(false)
    expect(isEventEnabled(config, "retry_exhausted")).toBe(true)
  })
})

describe("NotificationService", () => {
  function build(config: NotificationConfig, spy: NotificationStrategy) {
    const settings = { getConfig: async () => config } as unknown as SettingService
    const factory = { build: () => [spy] } as unknown as NotificationFactory
    return new NotificationService(settings, factory)
  }

  it("sends when the event is enabled", async () => {
    const send = vi.fn(async () => {})
    const spy: NotificationStrategy = { channel: "spy", send }
    const svc = build({ events: { failed: true, completed: false, retryExhausted: true } }, spy)
    await svc.notify(payload)
    expect(send).toHaveBeenCalledOnce()
  })

  it("does not send when the event is disabled", async () => {
    const send = vi.fn(async () => {})
    const spy: NotificationStrategy = { channel: "spy", send }
    const svc = build({ events: { failed: false, completed: false, retryExhausted: false } }, spy)
    await svc.notify(payload)
    expect(send).not.toHaveBeenCalled()
  })
})
