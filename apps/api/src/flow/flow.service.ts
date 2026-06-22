// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common"
import { validateFlowDefinition, validateFlowTrigger } from "@tempo-flow/flow-engine"
import { toJson } from "@tempo-flow/shared-types"
import { PrismaService } from "../prisma/prisma.service"
import { SchedulerService } from "../scheduler/scheduler.service"
import type { CreateFlowRequest, UpdateFlowRequest } from "./dto/flow.request"

@Injectable()
export class FlowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
  ) {}

  list() {
    return this.prisma.flow.findMany({ orderBy: { createdAt: "desc" } })
  }

  async get(id: string) {
    const flow = await this.prisma.flow.findUnique({ where: { id } })
    if (!flow) throw new NotFoundException("Flow not found")
    return flow
  }

  async create(input: CreateFlowRequest, userId: string) {
    this.assertValid(input.definition, input.trigger)
    const flow = await this.prisma.flow.create({
      data: {
        name: input.name,
        description: input.description,
        definition: toJson(input.definition),
        trigger: toJson(input.trigger),
        enabled: input.enabled ?? true,
        overlapPolicy: input.overlapPolicy ?? "skip",
        slaMs: input.slaMs ?? null,
        createdBy: userId,
      },
    })
    this.scheduler.register(flow)
    return flow
  }

  async update(id: string, input: UpdateFlowRequest, userId?: string) {
    const current = await this.get(id)
    if (input.definition !== undefined || input.trigger !== undefined) {
      // Re-validate against the (possibly partial) new definition/trigger.
      const def = input.definition ?? (await this.parseExisting(id)).definition
      const trigger = input.trigger ?? (await this.parseExisting(id)).trigger
      this.assertValid(def, trigger)
    }
    // Snapshot the pre-update state so it can be diffed / rolled back.
    await this.snapshot(current, userId)

    const data: Record<string, unknown> = {}
    if (input.name !== undefined) data.name = input.name
    if (input.description !== undefined) data.description = input.description
    if (input.definition !== undefined) data.definition = toJson(input.definition)
    if (input.trigger !== undefined) data.trigger = toJson(input.trigger)
    if (input.enabled !== undefined) data.enabled = input.enabled
    if (input.overlapPolicy !== undefined) data.overlapPolicy = input.overlapPolicy
    if (input.slaMs !== undefined) data.slaMs = input.slaMs
    const flow = await this.prisma.flow.update({ where: { id }, data })
    this.scheduler.register(flow)
    return flow
  }

  async remove(id: string): Promise<void> {
    await this.get(id)
    await this.prisma.flow.delete({ where: { id } })
    this.scheduler.unregister(id)
  }

  // --- versioning ---

  listVersions(flowId: string) {
    return this.prisma.flowVersion.findMany({
      where: { flowId },
      orderBy: { version: "desc" },
    })
  }

  async getVersion(flowId: string, version: number) {
    const row = await this.prisma.flowVersion.findUnique({
      where: { flowId_version: { flowId, version } },
    })
    if (!row) throw new NotFoundException("Version not found")
    return row
  }

  /** Restore a flow to a previous version (snapshotting the current first). */
  async restore(flowId: string, version: number, userId?: string) {
    const target = await this.getVersion(flowId, version)
    return this.update(
      flowId,
      {
        name: target.name,
        description: target.description ?? undefined,
        definition: JSON.parse(target.definition),
        trigger: JSON.parse(target.trigger),
      },
      userId,
    )
  }

  private async snapshot(
    flow: {
      id: string
      name: string
      description: string | null
      definition: string
      trigger: string
    },
    userId?: string,
  ): Promise<void> {
    const last = await this.prisma.flowVersion.findFirst({
      where: { flowId: flow.id },
      orderBy: { version: "desc" },
      select: { version: true },
    })
    await this.prisma.flowVersion.create({
      data: {
        flowId: flow.id,
        version: (last?.version ?? 0) + 1,
        name: flow.name,
        description: flow.description,
        definition: flow.definition,
        trigger: flow.trigger,
        createdBy: userId,
      },
    })
  }

  private async parseExisting(id: string) {
    const flow = await this.get(id)
    return {
      definition: JSON.parse(flow.definition) as unknown,
      trigger: JSON.parse(flow.trigger) as unknown,
    }
  }

  private assertValid(definition: unknown, trigger: unknown): void {
    const defResult = validateFlowDefinition(definition)
    const trigResult = validateFlowTrigger(trigger)
    const errors = [...defResult.errors, ...trigResult.errors]
    if (errors.length > 0) {
      throw new BadRequestException({ message: "Invalid flow", errors })
    }
  }
}
