// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { AgentStartInput, LlmClient, LlmStep, RunContext } from "@tempo-flow/executors"
import { type FlowNode, RunStatus, toJson } from "@tempo-flow/shared-types"
import { describe, expect, it, vi } from "vitest"
import type { RunEventsService } from "../events/run-events.service"
import type { FlowRunFinishedEvent } from "../notification/notification.listener"
import type { PrismaService } from "../prisma/prisma.service"
import type { QueueService } from "../queue/queue.service"
import type { SecretService } from "../secret/secret.service"
import { LlmAgentService } from "./llm-agent.service"
import type { RunLauncherService } from "./run-launcher.service"

const TOOL_FLOW = "tool-flow"

function agentNode(): FlowNode {
  return {
    id: "agent",
    name: "agent",
    executor: {
      type: "llm",
      prompt: "do it",
      tools: [
        { name: "lookup", description: "d", inputSchema: { type: "object" }, flowId: TOOL_FLOW },
      ],
      maxToolTurns: 3,
    } as unknown as FlowNode["executor"],
  }
}

function startInput(): AgentStartInput {
  const ctx: RunContext = {
    flowRunId: "run-1",
    nodeId: "agent",
    mapIndex: 0,
    runDate: new Date(2026, 5, 24),
    secrets: { ANTHROPIC_API_KEY: "sk" },
  }
  return { node: agentNode(), ctx, model: "claude-opus-4-8", prompt: "do it", apiKey: "sk" }
}

/** Minimal in-memory Prisma double covering the tables the driver touches. */
function fakePrisma() {
  const agents: Record<string, Record<string, unknown>> = {} // keyed by `${flowRunId}:${nodeId}:${mapIndex}`
  const flowRuns: Record<
    string,
    { id: string; flowId: string; status: string; definition: string }
  > = {}
  const nodeRuns: {
    id: string
    flowRunId: string
    nodeId: string
    mapIndex: number
    status: string
    attempt: number
  }[] = []
  let seq = 0
  const akey = (k: { flowRunId: string; nodeId: string; mapIndex: number }) =>
    `${k.flowRunId}:${k.nodeId}:${k.mapIndex}`
  const resolveAgent = (where: Record<string, unknown>) => {
    if (where.id) return Object.values(agents).find((a) => a.id === where.id)
    const c = where.flowRunId_nodeId_mapIndex as {
      flowRunId: string
      nodeId: string
      mapIndex: number
    }
    return agents[akey(c)]
  }
  const prisma = {
    llmAgentState: {
      upsert: vi.fn(async ({ where, create, update }) => {
        const existing = resolveAgent(where)
        if (existing) Object.assign(existing, update)
        else {
          const c = where.flowRunId_nodeId_mapIndex
          agents[akey(c)] = { id: `ag-${seq++}`, ...c, ...create }
        }
      }),
      findUnique: vi.fn(async ({ where }) => resolveAgent(where) ?? null),
      findMany: vi.fn(async ({ where }) =>
        Object.values(agents).filter(
          (a) => a.flowRunId === where.flowRunId && a.status === where.status,
        ),
      ),
      update: vi.fn(async ({ where, data }) => {
        const a = resolveAgent(where)
        if (a) Object.assign(a, data)
        return a
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        const a = resolveAgent(where)
        if (a && (where.status === undefined || a.status === where.status)) {
          Object.assign(a, data)
          return { count: 1 }
        }
        return { count: 0 }
      }),
    },
    flowRun: {
      findUnique: vi.fn(async ({ where, include }) => {
        const run = flowRuns[where.id]
        if (!run) return null
        return include?.flow ? { ...run, flow: { name: "f", definition: run.definition } } : run
      }),
    },
    nodeRun: {
      findMany: vi.fn(async ({ where }) =>
        nodeRuns
          .filter((n) => n.flowRunId === where.flowRunId)
          .map((n) => ({ nodeId: n.nodeId, output: toJson({ ok: true }) })),
      ),
      findFirst: vi.fn(
        async ({ where }) =>
          nodeRuns.find((n) => n.flowRunId === where.flowRunId && n.nodeId === where.nodeId) ??
          null,
      ),
      updateMany: vi.fn(async ({ where, data }) => {
        const n = nodeRuns.find(
          (r) =>
            r.flowRunId === where.flowRunId &&
            r.nodeId === where.nodeId &&
            r.status === where.status,
        )
        if (n) {
          Object.assign(n, data)
          return { count: 1 }
        }
        return { count: 0 }
      }),
    },
  } as unknown as PrismaService
  return { prisma, agents, flowRuns, nodeRuns, akey }
}

function build(client: LlmClient, over: { launchId?: string } = {}) {
  const f = fakePrisma()
  const launch = vi.fn().mockResolvedValue({ id: over.launchId ?? "child-1" })
  const launcher = { launch } as unknown as RunLauncherService
  const secrets = {
    resolveForFlow: vi.fn().mockResolvedValue({ ANTHROPIC_API_KEY: "sk" }),
  } as unknown as SecretService
  const runEvents = { publish: vi.fn().mockResolvedValue(undefined) } as unknown as RunEventsService
  const queue = { enqueueResume: vi.fn().mockResolvedValue(undefined) } as unknown as QueueService
  const config = { get: () => undefined } as never
  const svc = new LlmAgentService(f.prisma, launcher, secrets, runEvents, queue, config)
  ;(svc as { clients: Record<string, LlmClient> }).clients = { anthropic: client }
  return { svc, launch, queue, ...f }
}

function stepClient(steps: LlmStep[]): LlmClient {
  let i = 0
  return {
    provider: "anthropic",
    defaultModel: "claude-opus-4-8",
    async complete() {
      throw new Error("not used")
    },
    async stepTools() {
      return steps[Math.min(i++, steps.length - 1)]
    },
  }
}

const toolUseStep = (): LlmStep => ({
  assistantContent: [{ type: "tool_use", id: "tu_1", name: "lookup", input: { q: "x" } }],
  toolUses: [{ id: "tu_1", name: "lookup", input: { q: "x" } }],
  text: "",
  done: false,
  model: "claude-opus-4-8",
  usage: { inputTokens: 10, outputTokens: 4 },
})
const doneStep = (text: string): LlmStep => ({
  assistantContent: [{ type: "text", text }],
  toolUses: [],
  text,
  done: true,
  model: "claude-opus-4-8",
  usage: { inputTokens: 5, outputTokens: 2 },
})

describe("LlmAgentService", () => {
  it("start: a tool_use turn launches the sub-flow and suspends", async () => {
    const { svc, launch, agents, akey } = build(stepClient([toolUseStep()]))
    const result = await svc.start(startInput())
    expect(result).toMatchObject({ ok: true, suspend: true })
    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({ flowId: TOOL_FLOW, trigger: "agent-tool", parentRunId: "run-1" }),
    )
    const state = agents[akey({ flowRunId: "run-1", nodeId: "agent", mapIndex: 0 })]
    expect(state.status).toBe("WAITING_TOOLS")
    expect(JSON.parse(state.pendingTools as string)[0]).toMatchObject({ childRunId: "child-1" })
  })

  it("start: an immediate end_turn finishes with text output", async () => {
    const { svc, launch } = build(stepClient([doneStep("all done")]))
    const result = await svc.start(startInput())
    expect(result).toMatchObject({ ok: true, output: { text: "all done" } })
    expect(result.suspend).toBeUndefined()
    expect(launch).not.toHaveBeenCalled()
  })

  it("continue: no-op while the tool sub-flow is still running", async () => {
    const { svc, flowRuns } = build(stepClient([toolUseStep(), doneStep("answer")]))
    await svc.start(startInput())
    flowRuns["child-1"] = {
      id: "child-1",
      flowId: TOOL_FLOW,
      status: RunStatus.Running,
      definition: "{}",
    }
    await svc.continue("run-1")
    // still waiting — the agent NodeRun was never finalized
  })

  it("continue: child done → feeds result back and finalizes the node", async () => {
    const { svc, flowRuns, nodeRuns, agents, akey } = build(
      stepClient([toolUseStep(), doneStep("answer")]),
    )
    // the agent node is suspended (WAITING_CALLBACK), and the flow def resolves the node
    flowRuns["run-1"] = {
      id: "run-1",
      flowId: "flow-A",
      status: RunStatus.Running,
      definition: toJson({ nodes: [agentNode()], edges: [] }),
    }
    nodeRuns.push({
      id: "nr-1",
      flowRunId: "run-1",
      nodeId: "agent",
      mapIndex: 0,
      status: RunStatus.WaitingCallback,
      attempt: 0,
    })
    await svc.start(startInput())
    flowRuns["child-1"] = {
      id: "child-1",
      flowId: TOOL_FLOW,
      status: RunStatus.Success,
      definition: "{}",
    }

    await svc.continue("run-1")

    const node = nodeRuns.find((n) => n.id === "nr-1")!
    expect(node.status).toBe(RunStatus.Success)
    const state = agents[akey({ flowRunId: "run-1", nodeId: "agent", mapIndex: 0 })]
    expect(state.status).toBe("DONE")
  })

  it("continue: fails the node when the turn cap is exceeded", async () => {
    const node = agentNode()
    ;(node.executor as unknown as { maxToolTurns: number }).maxToolTurns = 1
    const { svc, flowRuns, nodeRuns } = build(stepClient([toolUseStep(), toolUseStep()]))
    flowRuns["run-1"] = {
      id: "run-1",
      flowId: "flow-A",
      status: RunStatus.Running,
      definition: toJson({ nodes: [node], edges: [] }),
    }
    nodeRuns.push({
      id: "nr-1",
      flowRunId: "run-1",
      nodeId: "agent",
      mapIndex: 0,
      status: RunStatus.WaitingCallback,
      attempt: 0,
    })
    await svc.start({ ...startInput(), node })
    flowRuns["child-1"] = {
      id: "child-1",
      flowId: TOOL_FLOW,
      status: RunStatus.Success,
      definition: "{}",
    }

    await svc.continue("run-1")

    expect(nodeRuns.find((n) => n.id === "nr-1")!.status).toBe(RunStatus.Failed)
  })

  it("onChildFinished: resumes the parent only for agent-tool children", async () => {
    const { svc, queue, flowRuns } = build(stepClient([doneStep("x")]))
    flowRuns["run-1"] = {
      id: "run-1",
      flowId: "flow-A",
      status: RunStatus.Running,
      definition: "{}",
    }
    const base: FlowRunFinishedEvent = {
      flowName: "f",
      flowRunId: "child-1",
      status: RunStatus.Success,
      parentRunId: "run-1",
    }
    await svc.onChildFinished({ ...base, trigger: "subflow" })
    expect(queue.enqueueResume).not.toHaveBeenCalled()
    await svc.onChildFinished({ ...base, trigger: "agent-tool" })
    expect(queue.enqueueResume).toHaveBeenCalledWith("run-1", "flow-A")
  })
})
