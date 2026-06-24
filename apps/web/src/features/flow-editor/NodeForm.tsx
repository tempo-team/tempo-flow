// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Plus, X } from "lucide-react"
import type {
  DateParam,
  FlowNode,
  HttpExecutorConfig,
  K8sExecutorConfig,
  LlmExecutorConfig,
  ScriptExecutorConfig,
  SubflowExecutorConfig,
} from "@tempo-flow/shared-types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  defaultHttpExecutor,
  defaultK8sExecutor,
  defaultLlmExecutor,
  defaultScriptExecutor,
  defaultSubflowExecutor,
} from "./state"
import { KeyValueEditor } from "./KeyValueEditor"

interface Props {
  node: FlowNode
  onChange: (next: FlowNode) => void
}

/** Edit a single node's config. Shared by the form list and the canvas panel. */
export function NodeForm({ node, onChange }: Props) {
  const http = node.executor as HttpExecutorConfig
  const k8s = node.executor as K8sExecutorConfig
  const subflow = node.executor as SubflowExecutorConfig
  const script = node.executor as ScriptExecutorConfig
  const llm = node.executor as LlmExecutorConfig

  function patch(p: Partial<FlowNode>): void {
    onChange({ ...node, ...p })
  }
  function patchExecutor(p: Record<string, unknown>): void {
    onChange({ ...node, executor: { ...node.executor, ...p } as FlowNode["executor"] })
  }
  function patchTool(i: number, p: Partial<NonNullable<LlmExecutorConfig["tools"]>[number]>): void {
    const tools = (llm.tools ?? []).map((t, j) => (j === i ? { ...t, ...p } : t))
    patchExecutor({ tools })
  }

  const dateParams = node.params?.dateParams ?? []
  function setDateParams(next: DateParam[]): void {
    onChange({ ...node, params: { ...node.params, dateParams: next } })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Node id">
          <Input value={node.id} onChange={(e) => patch({ id: e.target.value })} className="h-8" />
        </Field>
        <Field label="Name">
          <Input
            value={node.name}
            onChange={(e) => patch({ name: e.target.value })}
            className="h-8"
          />
        </Field>
      </div>

      <Field label="Executor">
        <Select
          value={node.executor.type}
          onValueChange={(t) =>
            patch({
              executor:
                t === "http"
                  ? defaultHttpExecutor()
                  : t === "k8s"
                    ? defaultK8sExecutor()
                    : t === "script"
                      ? defaultScriptExecutor()
                      : t === "llm"
                        ? defaultLlmExecutor()
                        : defaultSubflowExecutor(),
            })
          }
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="http">HTTP</SelectItem>
            <SelectItem value="k8s">Kubernetes Job</SelectItem>
            <SelectItem value="script">Script</SelectItem>
            <SelectItem value="llm">LLM</SelectItem>
            <SelectItem value="subflow">Sub-flow</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {node.executor.type === "llm" ? (
        <div className="space-y-3 rounded-md border p-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Provider">
              <Select
                value={llm.provider ?? "anthropic"}
                onValueChange={(p) => patchExecutor({ provider: p })}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                  <SelectItem value="openai">OpenAI (Codex)</SelectItem>
                  <SelectItem value="gemini">Gemini</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Model">
              <Input
                value={llm.model ?? ""}
                onChange={(e) => patchExecutor({ model: e.target.value || undefined })}
                placeholder="claude-opus-4-8"
                className="h-8 font-mono"
              />
            </Field>
          </div>
          <Field label="System (optional)">
            <textarea
              value={llm.system ?? ""}
              onChange={(e) => patchExecutor({ system: e.target.value || undefined })}
              rows={2}
              className="w-full rounded-md border bg-background p-2 text-xs"
              placeholder="You are a helpful assistant."
            />
          </Field>
          <Field label="Prompt">
            <textarea
              value={llm.prompt}
              onChange={(e) => patchExecutor({ prompt: e.target.value })}
              rows={5}
              className="w-full rounded-md border bg-background p-2 text-xs"
              placeholder="Summarize: ={{ nodes.fetch.output }}"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Effort">
              <Select
                value={llm.effort ?? "default"}
                onValueChange={(v) =>
                  patchExecutor({ effort: v === "default" ? undefined : (v as "low" | "high") })
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">default</SelectItem>
                  <SelectItem value="low">low</SelectItem>
                  <SelectItem value="medium">medium</SelectItem>
                  <SelectItem value="high">high</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="API key secret">
              <Input
                value={llm.apiKeySecret ?? ""}
                onChange={(e) => patchExecutor({ apiKeySecret: e.target.value || undefined })}
                placeholder="ANTHROPIC_API_KEY"
                className="h-8 font-mono"
              />
            </Field>
          </div>
          <div className="space-y-2 rounded-md border border-dashed p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Tools (agentic — Anthropic only)</span>
              <button
                type="button"
                className="rounded border px-2 py-0.5 text-xs"
                onClick={() =>
                  patchExecutor({
                    tools: [
                      ...(llm.tools ?? []),
                      {
                        name: "",
                        description: "",
                        inputSchema: { type: "object" },
                        flowId: "",
                      },
                    ],
                  })
                }
              >
                + Add tool
              </button>
            </div>
            {(llm.tools ?? []).map((tool, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: tools are an ordered, editable list
                key={i}
                className="grid grid-cols-2 gap-2 rounded border p-2"
              >
                <Input
                  value={tool.name}
                  onChange={(e) => patchTool(i, { name: e.target.value })}
                  placeholder="tool name"
                  className="h-7 font-mono text-xs"
                />
                <Input
                  value={tool.flowId}
                  onChange={(e) => patchTool(i, { flowId: e.target.value })}
                  placeholder="flow id"
                  className="h-7 font-mono text-xs"
                />
                <Input
                  value={tool.description}
                  onChange={(e) => patchTool(i, { description: e.target.value })}
                  placeholder="when to use this tool"
                  className="col-span-2 h-7 text-xs"
                />
                <button
                  type="button"
                  className="col-span-2 text-left text-xs text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    patchExecutor({ tools: (llm.tools ?? []).filter((_, j) => j !== i) })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            {(llm.tools ?? []).length > 0 ? (
              <Field label="Max tool turns">
                <Input
                  type="number"
                  value={llm.maxToolTurns ?? ""}
                  onChange={(e) =>
                    patchExecutor({
                      maxToolTurns: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder="5"
                  className="h-7 w-24 font-mono text-xs"
                />
              </Field>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Prompt/system support <code>={"{{ }}"}</code> expressions. Set an{" "}
            <code>outputSchema</code> or each tool's <code>inputSchema</code> via YAML import. Each
            tool runs its flow as a sub-flow and returns its outputs to the model.
          </p>
        </div>
      ) : node.executor.type === "script" ? (
        <div className="space-y-3 rounded-md border p-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Language">
              <Select value={script.language} onValueChange={(l) => patchExecutor({ language: l })}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["python", "node", "bash", "go"].map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Image (optional)">
              <Input
                value={script.image ?? ""}
                onChange={(e) => patchExecutor({ image: e.target.value || undefined })}
                placeholder="python:3.13-slim"
                className="h-8"
              />
            </Field>
          </div>
          <Field label="Code">
            <textarea
              value={script.code}
              onChange={(e) => patchExecutor({ code: e.target.value })}
              rows={10}
              spellCheck={false}
              className="w-full rounded-md border bg-background p-2 font-mono text-xs"
              placeholder="# params are in env as TF_PARAM_<KEY> and TEMPO_PARAMS (JSON)
# print a final JSON line to set this node's output"
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Runs in an isolated container (no network by default). Params arrive as{" "}
            <code>TF_PARAM_*</code> env vars; the last JSON line of stdout becomes the node output.
          </p>
        </div>
      ) : node.executor.type === "subflow" ? (
        <div className="space-y-3 rounded-md border p-3">
          <Field label="Child flow id">
            <Input
              value={subflow.flowId}
              onChange={(e) => patchExecutor({ flowId: e.target.value })}
              placeholder="clx… (the flow to run and wait on)"
              className="h-8"
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Launches the target flow and waits for it to finish. This node fails if the sub-flow
            fails. Cycles are rejected at run time.
          </p>
        </div>
      ) : node.executor.type === "http" ? (
        <div className="space-y-3 rounded-md border p-3">
          <Field label="URL">
            <Input
              value={http.url}
              onChange={(e) => patchExecutor({ url: e.target.value })}
              placeholder="https://api.example.com/job"
              className="h-8"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Method">
              <Select value={http.method} onValueChange={(m) => patchExecutor({ method: m })}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Params in">
              <Select
                value={http.paramsIn ?? "query"}
                onValueChange={(v) => patchExecutor({ paramsIn: v })}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="query">Query string</SelectItem>
                  <SelectItem value="body">JSON body</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <KeyValueEditor
            label="Headers"
            value={http.headers ?? {}}
            onChange={(headers) => patchExecutor({ headers })}
          />
        </div>
      ) : (
        <div className="space-y-3 rounded-md border p-3">
          <Field label="Image">
            <Input
              value={k8s.image}
              onChange={(e) => patchExecutor({ image: e.target.value })}
              placeholder="ghcr.io/acme/etl:1.0"
              className="h-8"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Namespace">
              <Input
                value={k8s.namespace ?? ""}
                onChange={(e) => patchExecutor({ namespace: e.target.value || undefined })}
                placeholder="default"
                className="h-8"
              />
            </Field>
            <Field label="Params as">
              <Select
                value={k8s.paramsAs ?? "env"}
                onValueChange={(v) => patchExecutor({ paramsAs: v })}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="env">Env vars</SelectItem>
                  <SelectItem value="args">Args</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Command (space-separated)">
            <Input
              value={(k8s.command ?? []).join(" ")}
              onChange={(e) =>
                patchExecutor({ command: e.target.value ? e.target.value.split(" ") : undefined })
              }
              placeholder="sh -c"
              className="h-8"
            />
          </Field>
        </div>
      )}

      <KeyValueEditor
        label="Static params"
        value={node.params?.static ?? {}}
        onChange={(staticParams) =>
          onChange({ ...node, params: { ...node.params, static: staticParams } })
        }
      />

      <div className="grid grid-cols-2 gap-3 rounded-md border p-3">
        <Field label="Fan-out (forEach JSONata → array)">
          <Input
            value={node.forEach ?? ""}
            onChange={(e) => patch({ forEach: e.target.value || undefined })}
            placeholder="nodes.list.output.ids"
            className="h-8 font-mono"
          />
        </Field>
        <Field label="Join">
          <Select
            value={node.join ?? "all"}
            onValueChange={(j) => patch({ join: j === "all" ? undefined : (j as "any" | "ratio") })}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">all succeed</SelectItem>
              <SelectItem value="any">any succeeds</SelectItem>
              <SelectItem value="ratio">success ratio</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Date params (reservation)
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() =>
              setDateParams([...dateParams, { key: "", expr: "${RUN_DATE}", format: "yyyyMMdd" }])
            }
          >
            <Plus className="size-3" /> Add
          </Button>
        </div>
        {dateParams.map((dp, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
            <Input
              value={dp.key}
              placeholder="key"
              className="h-8"
              onChange={(e) =>
                setDateParams(
                  dateParams.map((d, j) => (j === i ? { ...d, key: e.target.value } : d)),
                )
              }
            />
            <Input
              value={dp.expr}
              placeholder="${RUN_DATE-1d}"
              className="h-8"
              onChange={(e) =>
                setDateParams(
                  dateParams.map((d, j) => (j === i ? { ...d, expr: e.target.value } : d)),
                )
              }
            />
            <Input
              value={dp.format}
              placeholder="yyyyMMdd"
              className="h-8"
              onChange={(e) =>
                setDateParams(
                  dateParams.map((d, j) => (j === i ? { ...d, format: e.target.value } : d)),
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setDateParams(dateParams.filter((_, j) => j !== i))}
            >
              <X className="size-3" />
            </Button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Retry max">
          <Input
            type="number"
            min={0}
            value={node.retry?.max ?? 0}
            className="h-8"
            onChange={(e) =>
              patch({
                retry: {
                  max: Number(e.target.value),
                  backoff: node.retry?.backoff ?? "fixed",
                  delayMs: node.retry?.delayMs ?? 1000,
                },
              })
            }
          />
        </Field>
        <Field label="Backoff">
          <Select
            value={node.retry?.backoff ?? "fixed"}
            onValueChange={(b) =>
              patch({
                retry: {
                  max: node.retry?.max ?? 0,
                  backoff: b as "fixed" | "exponential",
                  delayMs: node.retry?.delayMs ?? 1000,
                },
              })
            }
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Fixed</SelectItem>
              <SelectItem value="exponential">Exponential</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Timeout (ms)">
          <Input
            type="number"
            min={0}
            value={node.timeoutMs ?? ""}
            className="h-8"
            onChange={(e) =>
              patch({ timeoutMs: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </Field>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
