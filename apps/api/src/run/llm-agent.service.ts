// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { OnEvent } from "@nestjs/event-emitter"
import {
  type AgentStartInput,
  AnthropicClient,
  type ExecResult,
  GeminiClient,
  type LlmClient,
  OpenAiClient,
  tryParseJson,
} from "@tempo-flow/executors"
import {
  type FlowDefinition,
  type LlmExecutorConfig,
  type LlmProvider,
  RunStatus,
  fromJson,
  fromJsonOpt,
  isTerminal,
  toJson,
} from "@tempo-flow/shared-types"
import { decryptSecret, encryptSecret } from "../common/crypto"
import { maskValues } from "../common/mask"
import { RunEventsService } from "../events/run-events.service"
import { FLOW_RUN_FINISHED, type FlowRunFinishedEvent } from "../notification/notification.listener"
import { PrismaService } from "../prisma/prisma.service"
import { QueueService } from "../queue/queue.service"
import { SecretService } from "../secret/secret.service"
import { loadChildOutputs, toParams } from "./agent-tool-helpers"
import { RunLauncherService } from "./run-launcher.service"
import { type LaunchGuardrails, checkLaunchGuardrails, findFlowCycle } from "./subflow-cycle"

const DEFAULT_KEY_SECRET: Record<LlmProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
}
const DEFAULT_MAX_TOOL_TURNS = 5
const SUSPEND_WINDOW_MS = 30 * 60 * 1000

/** A pending tool call: either launched (childRunId) or resolved immediately (error). */
interface PendingTool {
  toolUseId: string
  toolName: string
  childRunId?: string
  error?: string
}

type TurnOutcome =
  | { kind: "done"; output: unknown; response: unknown }
  | { kind: "suspend"; response: unknown }
  | { kind: "failed"; response: unknown; errorMessage: string }

/** Everything a turn needs; reconstructed on each resume (apiKey re-resolved, never persisted). */
interface TurnCtx {
  flowRunId: string
  nodeId: string
  mapIndex: number
  provider: LlmProvider
  model: string
  system?: string
  apiKey: string
  cfg: LlmExecutorConfig
  guardrails?: LaunchGuardrails
  onLog: (line: string) => void
}

/**
 * Durable agentic tool loop. A tool-using LLM node persists its conversation in
 * LlmAgentState and suspends (WAITING_CALLBACK) while each tool runs as a sub-flow.
 * When a tool sub-flow finishes it resumes the parent run; `continue()` (called by
 * RunService before each advance) feeds the results back and runs the next turn.
 * This survives worker restarts and frees the worker while tools run — unlike the
 * old in-memory loop.
 */
@Injectable()
export class LlmAgentService {
  private readonly logger = new Logger(LlmAgentService.name)
  readonly clients: Partial<Record<LlmProvider, LlmClient>>
  /** Key for encrypting the persisted conversation at rest (same as the secret store). */
  private readonly encKey: string

  constructor(
    private readonly prisma: PrismaService,
    private readonly launcher: RunLauncherService,
    private readonly secrets: SecretService,
    private readonly runEvents: RunEventsService,
    private readonly queue: QueueService,
    config: ConfigService,
  ) {
    this.clients = {
      anthropic: new AnthropicClient(),
      openai: new OpenAiClient(undefined, config.get<string>("OPENAI_DEFAULT_MODEL")),
      gemini: new GeminiClient(undefined, config.get<string>("GEMINI_DEFAULT_MODEL")),
    }
    this.encKey =
      config.get<string>("SETTINGS_ENCRYPTION_KEY") ?? "0123456789abcdef0123456789abcdef"
  }

  /**
   * The persisted conversation (`messages`, `system`) is encrypted at rest: a
   * prompt resolved from `={{ secrets.X }}` would otherwise sit in the DB in
   * plaintext, defeating the secret store's encryption. Encrypting (not masking)
   * preserves the values for replay across resumed turns.
   */
  private encMessages(messages: unknown[]): string {
    return encryptSecret(toJson(messages), this.encKey)
  }
  private decMessages(stored: string): unknown[] {
    return fromJson<unknown[]>(decryptSecret(stored, this.encKey), [])
  }

  /** First turn (called by LlmExecutor for a tools node). Returns an ExecResult to the engine. */
  async start(input: AgentStartInput): Promise<ExecResult> {
    const { node, ctx, model, system, prompt, apiKey } = input
    const cfg = node.executor as LlmExecutorConfig
    const mapIndex = ctx.mapIndex ?? 0
    const key = { flowRunId: ctx.flowRunId, nodeId: ctx.nodeId, mapIndex }
    const messages = [{ role: "user", content: prompt }]
    const base = {
      status: "RUNNING_TURN",
      turn: 0,
      messages: this.encMessages(messages),
      pendingTools: null,
      inputTokens: 0,
      outputTokens: 0,
      model,
      system: system ? encryptSecret(system, this.encKey) : null,
    }
    await this.prisma.llmAgentState.upsert({
      where: { flowRunId_nodeId_mapIndex: key },
      create: { ...key, ...base },
      update: base,
    })

    const tctx: TurnCtx = {
      ...key,
      provider: cfg.provider ?? "anthropic",
      model,
      system,
      apiKey,
      cfg,
      guardrails: ctx.guardrails,
      onLog: (l) => ctx.onLog?.(l),
    }
    const request = { provider: tctx.provider, model, tools: cfg.tools?.length ?? 0 }
    try {
      const outcome = await this.runTurn(tctx)
      // Belt-and-suspenders: a tool sub-flow could finish in the window between
      // launch and the WAITING_TOOLS commit, losing its resume event. A self-resume
      // re-checks once the state is durably persisted (idempotent no-op otherwise).
      if (outcome.kind === "suspend") await this.scheduleResume(ctx.flowRunId)
      return this.toExecResult(outcome, request)
    } catch (err) {
      await this.markDone(key)
      return { ok: false, request, errorMessage: (err as Error).message }
    }
  }

  /**
   * Resume any suspended agent nodes in this run whose tool sub-flows have all
   * finished: feed the results back and run the next turn. Called by RunService
   * before engine.advance() on every resume tick (no-op when there are none).
   */
  async continue(flowRunId: string): Promise<void> {
    const states = await this.prisma.llmAgentState.findMany({
      where: { flowRunId, status: "WAITING_TOOLS" },
    })
    for (const state of states) {
      const pending = fromJson<PendingTool[]>(state.pendingTools, [])
      const ready = await this.allToolsDone(pending)
      if (!ready) continue

      // The agent NodeRun must be WAITING_CALLBACK before we advance a turn — its
      // terminal write (finalizeNode) targets that status. Two races make it not so:
      //   - launch-before-commit: a fast child resumed us before the engine wrote
      //     WAITING_CALLBACK (node still RUNNING) → reschedule and retry later.
      //   - SLA watchdog already failed the node (terminal) → stop and tidy state.
      const node = await this.prisma.nodeRun.findFirst({
        where: { flowRunId, nodeId: state.nodeId, mapIndex: state.mapIndex },
        select: { status: true },
      })
      if (!node || isTerminal(node.status as RunStatus)) {
        await this.markDone(state) // watchdog/cancel won the node; don't reprocess
        continue
      }
      if (node.status !== RunStatus.WaitingCallback) {
        await this.scheduleResume(flowRunId) // not suspended yet — retry without consuming the turn
        continue
      }

      // Claim the turn: only one resume tick advances it.
      const claim = await this.prisma.llmAgentState.updateMany({
        where: { id: state.id, status: "WAITING_TOOLS" },
        data: { status: "RUNNING_TURN" },
      })
      if (claim.count === 0) continue

      try {
        const tctx = await this.rebuildTurnCtx(state)
        if (!tctx) {
          await this.failNode(
            flowRunId,
            state.nodeId,
            state.mapIndex,
            "Agent flow/secret unresolved",
          )
          await this.markDone(state)
          continue
        }
        const results = await this.collectToolResults(pending)
        await this.appendUserMessage(state, results)
        const outcome = await this.runTurn(tctx)
        await this.applyOutcome(tctx, outcome)
      } catch (err) {
        this.logger.warn(`Agent continue failed (run ${flowRunId}/${state.nodeId}): ${err}`)
        await this.failNode(flowRunId, state.nodeId, state.mapIndex, (err as Error).message)
        await this.markDone(state)
      }
    }
  }

  /**
   * When a tool sub-flow (trigger "agent-tool") finishes, resume its parent run so
   * `continue()` can feed the result back into the agent loop. Other child runs
   * (e.g. plain sub-flows, which poll in-memory) are ignored to avoid a resume tick
   * racing a still-RUNNING node.
   */
  @OnEvent(FLOW_RUN_FINISHED)
  async onChildFinished(event: FlowRunFinishedEvent): Promise<void> {
    if (event.trigger !== "agent-tool" || !event.parentRunId) return
    const parent = await this.prisma.flowRun.findUnique({
      where: { id: event.parentRunId },
      select: { flowId: true, status: true },
    })
    if (!parent || isTerminal(parent.status as RunStatus)) return
    await this.queue.enqueueResume(event.parentRunId, parent.flowId)
  }

  // --- turn execution -----------------------------------------------------

  private async runTurn(tctx: TurnCtx): Promise<TurnOutcome> {
    const key = { flowRunId: tctx.flowRunId, nodeId: tctx.nodeId, mapIndex: tctx.mapIndex }
    const state = await this.prisma.llmAgentState.findUnique({
      where: { flowRunId_nodeId_mapIndex: key },
    })
    if (!state) throw new Error("Agent state missing")

    const client = this.clients[tctx.provider]
    if (!client?.stepTools) throw new Error(`Provider "${tctx.provider}" does not support tools`)

    const messages = this.decMessages(state.messages)
    const tools = (tctx.cfg.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }))
    const step = await client.stepTools({
      apiKey: tctx.apiKey,
      model: tctx.model,
      system: tctx.system,
      messages,
      tools,
      maxTokens: tctx.cfg.maxTokens,
      effort: tctx.cfg.effort,
      onLog: tctx.onLog,
    })

    const turn = state.turn + 1
    const inputTokens = state.inputTokens + step.usage.inputTokens
    const outputTokens = state.outputTokens + step.usage.outputTokens
    const response = { model: step.model, usage: { inputTokens, outputTokens }, turns: turn }

    if (step.done) {
      await this.markDone(key, { turn, inputTokens, outputTokens, model: step.model })
      const output = tctx.cfg.outputSchema
        ? (tryParseJson(step.text) ?? { text: step.text })
        : { text: step.text }
      return { kind: "done", output, response }
    }
    const maxTurns = tctx.cfg.maxToolTurns ?? DEFAULT_MAX_TOOL_TURNS
    if (turn > maxTurns) {
      await this.markDone(key, { turn, inputTokens, outputTokens })
      return {
        kind: "failed",
        response,
        errorMessage: `Tool loop did not finish within ${maxTurns} turns`,
      }
    }

    // Launch a sub-flow per tool call (or record an immediate error tool_result).
    const withAssistant = [...messages, { role: "assistant", content: step.assistantContent }]
    const pending: PendingTool[] = []
    for (const use of step.toolUses) {
      const tool = (tctx.cfg.tools ?? []).find((t) => t.name === use.name)
      if (!tool) {
        pending.push({ toolUseId: use.id, toolName: use.name, error: `Unknown tool "${use.name}"` })
        continue
      }
      const cycle = await findFlowCycle(this.prisma, tctx.flowRunId, tool.flowId)
      if (cycle) {
        pending.push({ toolUseId: use.id, toolName: use.name, error: `cycle: ${cycle}` })
        continue
      }
      const breach = await checkLaunchGuardrails(
        this.prisma,
        tctx.flowRunId,
        tool.flowId,
        tctx.guardrails,
      )
      if (breach) {
        // Feed back the tool name only — don't expose the internal flowId / which
        // guardrail tripped to the model (it could echo it via a prompt injection).
        pending.push({
          toolUseId: use.id,
          toolName: use.name,
          error: `Tool "${use.name}" is not permitted`,
        })
        continue
      }
      const child = await this.launcher.launch({
        flowId: tool.flowId,
        trigger: "agent-tool",
        params: toParams(use.input),
        parentRunId: tctx.flowRunId,
      })
      pending.push({ toolUseId: use.id, toolName: use.name, childRunId: child.id })
    }

    const launched = pending.some((p) => p.childRunId)
    await this.prisma.llmAgentState.update({
      where: { flowRunId_nodeId_mapIndex: key },
      data: {
        // Wait for the launched sub-flows; if none launched (all errors) keep the
        // turn open and continue immediately below.
        status: launched ? "WAITING_TOOLS" : "RUNNING_TURN",
        turn,
        inputTokens,
        outputTokens,
        model: step.model,
        messages: this.encMessages(withAssistant),
        pendingTools: toJson(pending),
      },
    })

    if (launched) return { kind: "suspend", response }

    // No sub-flows to wait on (every tool errored) — feed results back now.
    const results = await this.collectToolResults(pending)
    await this.appendUserMessage(key, results)
    return this.runTurn(tctx)
  }

  // --- helpers ------------------------------------------------------------

  private toExecResult(outcome: TurnOutcome, request: unknown): ExecResult {
    if (outcome.kind === "done") {
      return { ok: true, request, response: outcome.response, output: outcome.output }
    }
    if (outcome.kind === "suspend") {
      return { ok: true, suspend: true, request, response: outcome.response }
    }
    return { ok: false, request, response: outcome.response, errorMessage: outcome.errorMessage }
  }

  /** Apply a resumed turn's outcome to the agent NodeRun (continue path). */
  private async applyOutcome(tctx: TurnCtx, outcome: TurnOutcome): Promise<void> {
    const { flowRunId, nodeId, mapIndex } = tctx
    if (outcome.kind === "suspend") {
      // Still waiting on the next batch of tools — keep WAITING_CALLBACK, refresh deadline.
      await this.prisma.nodeRun.updateMany({
        where: { flowRunId, nodeId, mapIndex, status: RunStatus.WaitingCallback },
        data: { callbackDeadline: new Date(Date.now() + SUSPEND_WINDOW_MS) },
      })
      await this.scheduleResume(flowRunId) // close the launch-before-commit race (see start)
      return
    }
    const secrets = await this.secrets.resolveForFlow(await this.flowIdOf(flowRunId))
    const sensitive = Object.values(secrets)
    await this.finalizeNode(flowRunId, nodeId, mapIndex, {
      status: outcome.kind === "done" ? RunStatus.Success : RunStatus.Failed,
      response: maskValues(outcome.response, sensitive),
      output: outcome.kind === "done" ? maskValues(outcome.output, sensitive) : undefined,
      errorMessage: outcome.kind === "failed" ? outcome.errorMessage : undefined,
    })
  }

  private async finalizeNode(
    flowRunId: string,
    nodeId: string,
    mapIndex: number,
    patch: { status: RunStatus; response?: unknown; output?: unknown; errorMessage?: string },
  ): Promise<void> {
    // Only transition a still-suspended node (race guard vs the SLA watchdog).
    const res = await this.prisma.nodeRun.updateMany({
      where: { flowRunId, nodeId, mapIndex, status: RunStatus.WaitingCallback },
      data: {
        status: patch.status,
        response: patch.response === undefined ? undefined : toJson(patch.response),
        output: patch.output === undefined ? undefined : toJson(patch.output),
        errorMessage: patch.errorMessage,
        finishedAt: new Date(),
      },
    })
    if (res.count === 0) return
    const row = await this.prisma.nodeRun.findFirst({ where: { flowRunId, nodeId, mapIndex } })
    if (row) {
      await this.runEvents.publish({
        kind: "node.status",
        flowRunId,
        nodeId,
        nodeRunId: row.id,
        status: patch.status,
        attempt: row.attempt,
        at: new Date().toISOString(),
        errorMessage: patch.errorMessage,
      })
    }
  }

  private async failNode(
    flowRunId: string,
    nodeId: string,
    mapIndex: number,
    errorMessage: string,
  ): Promise<void> {
    await this.finalizeNode(flowRunId, nodeId, mapIndex, { status: RunStatus.Failed, errorMessage })
  }

  /** True when every pending tool is resolved (errored, or its sub-flow is terminal). */
  private async allToolsDone(pending: PendingTool[]): Promise<boolean> {
    for (const p of pending) {
      if (p.error || !p.childRunId) continue
      const run = await this.prisma.flowRun.findUnique({
        where: { id: p.childRunId },
        select: { status: true },
      })
      if (!run || !isTerminal(run.status as RunStatus)) return false
    }
    return true
  }

  /** Build the tool_result blocks (Anthropic shape) for a resolved pending set. */
  private async collectToolResults(pending: PendingTool[]): Promise<unknown[]> {
    const blocks: unknown[] = []
    for (const p of pending) {
      if (p.error || !p.childRunId) {
        blocks.push(toolResult(p.toolUseId, p.error ?? "tool failed", true))
        continue
      }
      const run = await this.prisma.flowRun.findUnique({
        where: { id: p.childRunId },
        select: { status: true },
      })
      const status = (run?.status ?? RunStatus.Failed) as RunStatus
      const outputs = await loadChildOutputs(this.prisma, p.childRunId)
      blocks.push(
        toolResult(p.toolUseId, JSON.stringify({ status, outputs }), status !== RunStatus.Success),
      )
    }
    return blocks
  }

  private async appendUserMessage(
    key: { flowRunId: string; nodeId: string; mapIndex: number } | { id: string },
    blocks: unknown[],
  ): Promise<void> {
    const where = "id" in key ? { id: key.id } : { flowRunId_nodeId_mapIndex: key }
    const state = await this.prisma.llmAgentState.findUnique({ where })
    if (!state) return
    const messages = this.decMessages(state.messages)
    messages.push({ role: "user", content: blocks })
    await this.prisma.llmAgentState.update({
      where,
      data: { messages: this.encMessages(messages) },
    })
  }

  private async markDone(
    key: { flowRunId: string; nodeId: string; mapIndex: number } | { id: string },
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    const where = "id" in key ? { id: key.id } : { flowRunId_nodeId_mapIndex: key }
    await this.prisma.llmAgentState.update({ where, data: { status: "DONE", ...extra } })
  }

  /** Reconstruct turn context on resume: cfg from the flow def, apiKey from secrets. */
  private async rebuildTurnCtx(state: {
    flowRunId: string
    nodeId: string
    mapIndex: number
    model: string | null
    system: string | null
  }): Promise<TurnCtx | null> {
    const run = await this.prisma.flowRun.findUnique({
      where: { id: state.flowRunId },
      include: { flow: true },
    })
    if (!run) return null
    const def = fromJson<FlowDefinition>(run.flow.definition, { nodes: [], edges: [] })
    const node = def.nodes.find((n) => n.id === state.nodeId)
    if (!node || node.executor.type !== "llm") return null
    const cfg = node.executor as LlmExecutorConfig
    const provider = cfg.provider ?? "anthropic"
    const client = this.clients[provider]
    if (!client) return null
    const secrets = await this.secrets.resolveForFlow(run.flowId)
    const apiKey = secrets[cfg.apiKeySecret ?? DEFAULT_KEY_SECRET[provider]]
    if (!apiKey) return null
    return {
      flowRunId: state.flowRunId,
      nodeId: state.nodeId,
      mapIndex: state.mapIndex,
      provider,
      model: state.model ?? cfg.model ?? client.defaultModel,
      system: state.system ? decryptSecret(state.system, this.encKey) : undefined,
      apiKey,
      cfg,
      guardrails: def.guardrails,
      onLog: (l) =>
        this.runEvents.publish({
          kind: "node.log",
          flowRunId: state.flowRunId,
          nodeId: state.nodeId,
          line: l,
          at: new Date().toISOString(),
        }),
    }
  }

  private async flowIdOf(flowRunId: string): Promise<string> {
    const run = await this.prisma.flowRun.findUnique({
      where: { id: flowRunId },
      select: { flowId: true },
    })
    return run?.flowId ?? ""
  }

  /** Enqueue a resume tick for this run (idempotent — continue() no-ops if not ready). */
  private async scheduleResume(flowRunId: string): Promise<void> {
    const flowId = await this.flowIdOf(flowRunId)
    if (flowId) await this.queue.enqueueResume(flowRunId, flowId)
  }
}

/** Anthropic tool_result content block. */
function toolResult(toolUseId: string, content: string, isError: boolean): unknown {
  return { type: "tool_result", tool_use_id: toolUseId, content, is_error: isError }
}
