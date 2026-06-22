// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import {
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import { RunLauncherService } from "../../run/run-launcher.service"
import type { EventMessage, EventTriggerAdapter } from "./event-adapter"
import { RedisStreamAdapter } from "./redis-stream.adapter"

export interface CreateEventTriggerInput {
  source?: string
  topic: string
  filter?: Record<string, string>
}

@Injectable()
export class EventTriggerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventTriggerService.name)
  private readonly adapters: Map<string, EventTriggerAdapter>

  constructor(
    private readonly prisma: PrismaService,
    private readonly launcher: RunLauncherService,
    redisStream: RedisStreamAdapter,
  ) {
    this.adapters = new Map([[redisStream.source, redisStream]])
  }

  async onModuleInit(): Promise<void> {
    await this.reload()
  }

  async onModuleDestroy(): Promise<void> {
    for (const adapter of this.adapters.values()) await adapter.stop()
  }

  /** Re-read enabled triggers and (re)subscribe each adapter to its topics. */
  async reload(): Promise<void> {
    const triggers = await this.prisma.flowEventTrigger.findMany({ where: { enabled: true } })
    const topicsBySource = new Map<string, Set<string>>()
    for (const t of triggers) {
      if (!topicsBySource.has(t.source)) topicsBySource.set(t.source, new Set())
      topicsBySource.get(t.source)?.add(t.topic)
    }
    for (const [source, topics] of topicsBySource) {
      if (!this.adapters.has(source)) {
        this.logger.warn(`No adapter for source '${source}' — its triggers are inactive`)
      }
    }
    for (const [source, adapter] of this.adapters) {
      const topics = [...(topicsBySource.get(source) ?? [])]
      await adapter.start(topics, (msg) => void this.handle(source, msg))
    }
  }

  private async handle(source: string, msg: EventMessage): Promise<void> {
    const triggers = await this.prisma.flowEventTrigger.findMany({
      where: { enabled: true, source, topic: msg.topic },
    })
    for (const t of triggers) {
      if (!matchesFilter(t.filterJson, msg.fields)) continue
      await this.launcher.launch({ flowId: t.flowId, trigger: "event", params: msg.fields })
      this.logger.log(`Event on '${msg.topic}' triggered flow ${t.flowId}`)
    }
  }

  // --- management ---

  async create(flowId: string, input: CreateEventTriggerInput) {
    const flow = await this.prisma.flow.findUnique({ where: { id: flowId } })
    if (!flow) throw new NotFoundException("Flow not found")
    const row = await this.prisma.flowEventTrigger.create({
      data: {
        flowId,
        source: input.source ?? "redis",
        topic: input.topic,
        filterJson: input.filter ? JSON.stringify(input.filter) : null,
      },
    })
    await this.reload()
    return row
  }

  list(flowId: string) {
    return this.prisma.flowEventTrigger.findMany({
      where: { flowId },
      orderBy: { createdAt: "desc" },
    })
  }

  async remove(flowId: string, id: string): Promise<void> {
    const row = await this.prisma.flowEventTrigger.findUnique({ where: { id } })
    if (!row || row.flowId !== flowId) throw new NotFoundException("Event trigger not found")
    await this.prisma.flowEventTrigger.delete({ where: { id } })
    await this.reload()
  }
}

/** All filter keys must equal the matching message field. */
export function matchesFilter(filterJson: string | null, fields: Record<string, string>): boolean {
  if (!filterJson) return true
  let filter: Record<string, string>
  try {
    filter = JSON.parse(filterJson) as Record<string, string>
  } catch {
    return false
  }
  return Object.entries(filter).every(([k, v]) => fields[k] === v)
}
