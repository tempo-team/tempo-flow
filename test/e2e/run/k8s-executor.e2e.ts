// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// K8s executor: a node runs as a one-shot Kubernetes Job. Params are injected as
// env vars; completion + logs are collected. Gated behind E2E_K8S (needs a
// reachable cluster, e.g. minikube; namespace via E2E_NAMESPACE).

import { describe, expect, it } from "vitest"
import { createFlow, manualRun, node } from "../setup/builders"
import { CAP } from "../setup/config"
import { nodeRun, waitForTerminal } from "../setup/wait"

const NS = process.env.E2E_NAMESPACE ?? "default"
const JOB_TIMEOUT = 180_000

describe.runIf(CAP.k8s)("k8s executor", () => {
  it(
    "runs a Job to success with an injected env param and collects logs",
    async () => {
      const flow = await createFlow({
        nodes: [
          node(
            "j",
            {
              type: "k8s",
              image: "busybox:1.36",
              command: ["sh", "-c", 'echo "RUN_DATE=$RUN_DATE"; exit 0'],
              namespace: NS,
              paramsAs: "env",
            },
            {
              params: {
                dateParams: [{ key: "RUN_DATE", expr: "${RUN_DATE}", format: "yyyyMMdd" }],
              },
            },
          ),
        ],
      })
      const run = await waitForTerminal(
        await manualRun(flow.id, { runDate: "2026-01-15T12:00:00.000Z" }),
        { timeout: JOB_TIMEOUT },
      )
      expect(run.status).toBe("SUCCESS")
      const resp = nodeRun(run, "j")?.response as { logs?: string; exitCode?: number }
      expect(resp.logs ?? "").toContain("RUN_DATE=2026")
    },
    JOB_TIMEOUT,
  )

  it(
    "fails the node when the Job exits non-zero",
    async () => {
      const flow = await createFlow({
        nodes: [
          node("j", {
            type: "k8s",
            image: "busybox:1.36",
            command: ["sh", "-c", "exit 1"],
            namespace: NS,
          }),
        ],
      })
      const run = await waitForTerminal(await manualRun(flow.id), { timeout: JOB_TIMEOUT })
      expect(run.status).toBe("FAILED")
      expect(nodeRun(run, "j")?.status).toBe("FAILED")
    },
    JOB_TIMEOUT,
  )
})
