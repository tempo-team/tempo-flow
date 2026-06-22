// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { fromJson } from "@tempo-flow/shared-types"
import { describe, expect, it, vi } from "vitest"
import type { RunEventsService } from "../events/run-events.service"
import type { PrismaService } from "../prisma/prisma.service"
import type { QueueService } from "../queue/queue.service"
import { RunLauncherService } from "./run-launcher.service"

function build() {
  const create = vi.fn().mockResolvedValue({ id: "run-1", flowId: "f1" })
  const enqueue = vi.fn().mockResolvedValue(undefined)
  const publish = vi.fn().mockResolvedValue(undefined)
  const prisma = { flowRun: { create } } as unknown as PrismaService
  const queue = { enqueueFlowRun: enqueue } as unknown as QueueService
  const events = { publish } as unknown as RunEventsService
  return { svc: new RunLauncherService(prisma, queue, events), create, enqueue, publish }
}

describe("RunLauncherService.launch", () => {
  it("creates a PENDING run, publishes the status event, and enqueues", async () => {
    const { svc, create, enqueue, publish } = build()
    const run = await svc.launch({
      flowId: "f1",
      trigger: "webhook",
      runDate: "2026-06-22",
      params: { a: "1" },
    })

    expect(run.id).toBe("run-1")
    const data = create.mock.calls[0][0].data
    expect(data).toMatchObject({ flowId: "f1", status: "PENDING", trigger: "webhook" })
    expect(fromJson(data.params, {})).toEqual({ runDate: "2026-06-22", params: { a: "1" } })

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "run.status", flowRunId: "run-1", status: "PENDING" }),
    )
    expect(enqueue).toHaveBeenCalledWith({ flowRunId: "run-1", flowId: "f1" })
  })

  it("records the trigger source verbatim", async () => {
    const { svc, create } = build()
    await svc.launch({ flowId: "f1", trigger: "schedule" })
    expect(create.mock.calls[0][0].data.trigger).toBe("schedule")
  })
})
