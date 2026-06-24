// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { FlowNode } from "@tempo-flow/shared-types"
import { describe, expect, it, vi } from "vitest"
import type { RunContext } from "./executor.js"
import {
  K8sExecutor,
  type K8sJobResult,
  type K8sJobRunner,
  buildJobManifest,
  k8sName,
} from "./k8s-executor.js"

const ctx: RunContext = { flowRunId: "RUN_ABC", nodeId: "n1", runDate: new Date(2026, 5, 20) }

function k8sNode(extra: Partial<FlowNode["executor"]> = {}): FlowNode {
  return {
    id: "extract",
    name: "extract",
    executor: { type: "k8s", image: "ghcr.io/acme/etl:1.2.3", ...extra } as never,
    params: { dateParams: [{ key: "RUN_DATE", expr: "${RUN_DATE}", format: "yyyyMMdd" }] },
  }
}

describe("buildJobManifest", () => {
  it("injects params as env vars by default", () => {
    const job = buildJobManifest(k8sNode(), { RUN_DATE: "20260620" }, { jobName: "j1" })
    const container = job.spec?.template.spec?.containers[0]
    expect(container?.image).toBe("ghcr.io/acme/etl:1.2.3")
    expect(container?.env).toContainEqual({ name: "RUN_DATE", value: "20260620" })
    expect(job.spec?.backoffLimit).toBe(0)
    expect(job.spec?.template.spec?.restartPolicy).toBe("Never")
  })

  it("injects params as --key=value args when paramsAs=args", () => {
    const job = buildJobManifest(
      k8sNode({ paramsAs: "args", command: ["python", "etl.py"] } as never),
      { RUN_DATE: "20260620" },
      { jobName: "j1" },
    )
    const container = job.spec?.template.spec?.containers[0]
    expect(container?.command).toEqual(["python", "etl.py"])
    expect(container?.args).toContain("--RUN_DATE=20260620")
    expect(container?.env).toBeUndefined()
  })

  it("honors the configured namespace", () => {
    const job = buildJobManifest(k8sNode({ namespace: "batch" } as never), {}, { jobName: "j1" })
    expect(job.metadata?.namespace).toBe("batch")
  })

  it("injects callback coordinates as env when in callback mode", () => {
    const job = buildJobManifest(
      k8sNode(),
      { RUN_DATE: "20260620" },
      { jobName: "j1", callback: { url: "https://host/api/callbacks/tok", token: "tok" } },
    )
    const env = job.spec?.template.spec?.containers[0]?.env
    expect(env).toContainEqual({
      name: "TEMPO_CALLBACK_URL",
      value: "https://host/api/callbacks/tok",
    })
    expect(env).toContainEqual({ name: "TEMPO_CALLBACK_TOKEN", value: "tok" })
  })

  it("injects callback env even when params go to args", () => {
    const job = buildJobManifest(
      k8sNode({ paramsAs: "args" } as never),
      { RUN_DATE: "20260620" },
      { jobName: "j1", callback: { url: "https://host/api/callbacks/tok", token: "tok" } },
    )
    const env = job.spec?.template.spec?.containers[0]?.env
    expect(env).toContainEqual({
      name: "TEMPO_CALLBACK_URL",
      value: "https://host/api/callbacks/tok",
    })
    expect(env).not.toContainEqual({ name: "RUN_DATE", value: "20260620" }) // params still go to args
  })
})

describe("k8sName", () => {
  it("produces a DNS-1123 safe name", () => {
    expect(k8sName("Extract_Node", "RUN_ABC")).toBe("extract-node-run-abc")
  })
})

describe("K8sExecutor", () => {
  it("returns ok when the runner reports success", async () => {
    const runner: K8sJobRunner = {
      run: vi.fn(
        async (): Promise<K8sJobResult> => ({ succeeded: true, exitCode: 0, logs: "done" }),
      ),
    }
    const exec = new K8sExecutor(runner)
    const result = await exec.execute(k8sNode(), ctx)
    expect(result.ok).toBe(true)
    expect((result.response as { exitCode: number }).exitCode).toBe(0)
  })

  it("returns failure with message when the Job fails", async () => {
    const runner: K8sJobRunner = {
      run: async (): Promise<K8sJobResult> => ({ succeeded: false, exitCode: 1, message: "boom" }),
    }
    const exec = new K8sExecutor(runner)
    const result = await exec.execute(k8sNode(), ctx)
    expect(result.ok).toBe(false)
    expect(result.errorMessage).toBe("boom")
  })
})
