// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto"
import { RunStatus } from "@tempo-flow/shared-types"
import { describe, expect, it, vi } from "vitest"
import type { RunEventsService } from "../events/run-events.service"
import type { PrismaService } from "../prisma/prisma.service"
import type { QueueService } from "../queue/queue.service"
import { CallbackService } from "./callback.service"

const TOKEN = "secret-token"
const HASH = createHash("sha256").update(TOKEN).digest("hex")

function build(node: { status: RunStatus } | null) {
  const row = node
    ? {
        id: "nr-1",
        nodeId: "n1",
        flowRunId: "run-1",
        attempt: 0,
        status: node.status,
        flowRun: { flowId: "f1", flow: { definition: '{"nodes":[],"edges":[]}' } },
      }
    : null
  const findUnique = vi.fn().mockResolvedValue(row)
  const updateMany = vi.fn().mockResolvedValue({ count: 1 })
  const publish = vi.fn().mockResolvedValue(undefined)
  const enqueueResume = vi.fn().mockResolvedValue(undefined)
  const prisma = { nodeRun: { findUnique, updateMany } } as unknown as PrismaService
  const events = { publish } as unknown as RunEventsService
  const queue = { enqueueResume } as unknown as QueueService
  return { svc: new CallbackService(prisma, events, queue), findUnique, updateMany, enqueueResume }
}

describe("CallbackService.report", () => {
  it("resolves a waiting node to SUCCESS and enqueues a resume", async () => {
    const { svc, updateMany, enqueueResume } = build({ status: RunStatus.WaitingCallback })
    await svc.report(TOKEN, { status: "success", output: { rows: 5 } })
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "nr-1", status: RunStatus.WaitingCallback },
        data: expect.objectContaining({ status: RunStatus.Success }),
      }),
    )
    expect(enqueueResume).toHaveBeenCalledWith("run-1", "f1")
  })

  it("maps a failure callback to FAILED", async () => {
    const { svc, updateMany } = build({ status: RunStatus.WaitingCallback })
    await svc.report(TOKEN, { status: "failure", errorMessage: "boom" })
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: RunStatus.Failed }) }),
    )
  })

  it("is idempotent: a duplicate callback on a terminal node is a no-op", async () => {
    const { svc, updateMany, enqueueResume } = build({ status: RunStatus.Success })
    await svc.report(TOKEN, { status: "success" })
    expect(updateMany).not.toHaveBeenCalled()
    expect(enqueueResume).not.toHaveBeenCalled()
  })

  it("rejects an unknown token", async () => {
    const { svc } = build(null)
    await expect(svc.report("nope", { status: "success" })).rejects.toThrow(/Unknown/)
  })

  it("looks the node up by the sha256 of the token, never the raw token", async () => {
    const { svc, findUnique } = build({ status: RunStatus.WaitingCallback })
    await svc.report(TOKEN, { status: "success" })
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { callbackTokenHash: HASH } }),
    )
  })
})
