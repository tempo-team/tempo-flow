// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { BadRequestException } from "@nestjs/common"
import type { FlowDefinition, FlowTrigger } from "@tempo-flow/shared-types"
import { describe, expect, it, vi } from "vitest"
import type { PrismaService } from "../prisma/prisma.service"
import type { SchedulerService } from "../scheduler/scheduler.service"
import type { CreateFlowRequest } from "./dto/flow.request"
import { FlowService } from "./flow.service"

function makePrisma(create = vi.fn()): PrismaService {
  return { flow: { create } } as unknown as PrismaService
}

const scheduler = { register: vi.fn(), unregister: vi.fn() } as unknown as SchedulerService

function makeService(prisma: PrismaService): FlowService {
  return new FlowService(prisma, scheduler)
}

const validDef: FlowDefinition = {
  nodes: [
    { id: "a", name: "a", executor: { type: "http", url: "https://x.test/r", method: "POST" } },
  ],
  edges: [],
}
const cronTrigger: FlowTrigger = { type: "cron", expr: "*/5 * * * * *" }

describe("FlowService.create", () => {
  it("persists a valid flow as JSON strings", async () => {
    const create = vi.fn().mockResolvedValue({ id: "f1" })
    const svc = makeService(makePrisma(create))
    const input: CreateFlowRequest = { name: "demo", definition: validDef, trigger: cronTrigger }
    await svc.create(input, "user1")
    expect(create).toHaveBeenCalledOnce()
    const data = create.mock.calls[0][0].data
    expect(typeof data.definition).toBe("string")
    expect(JSON.parse(data.definition)).toEqual(validDef)
    expect(data.createdBy).toBe("user1")
    expect(data.overlapPolicy).toBe("skip")
  })

  it("rejects an invalid DAG (cycle) with BadRequest", async () => {
    const svc = makeService(makePrisma())
    const cyclic: FlowDefinition = {
      nodes: [
        { id: "a", name: "a", executor: { type: "http", url: "https://x/r", method: "POST" } },
        { id: "b", name: "b", executor: { type: "http", url: "https://x/r", method: "POST" } },
      ],
      edges: [
        { id: "e1", source: "a", target: "b", on: "success" },
        { id: "e2", source: "b", target: "a", on: "success" },
      ],
    }
    await expect(
      svc.create({ name: "bad", definition: cyclic, trigger: cronTrigger }, "u1"),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it("rejects a cron trigger without expr", async () => {
    const svc = makeService(makePrisma())
    await expect(
      svc.create({ name: "bad", definition: validDef, trigger: { type: "cron" } }, "u1"),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
