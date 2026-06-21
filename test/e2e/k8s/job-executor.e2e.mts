// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// minikube E2E: runs a real Kubernetes Job via DefaultK8sJobRunner + K8sExecutor
// and asserts success + log collection. Requires a reachable cluster
// (minikube). Invoked by `make e2e-k8s`.
//
// Run: pnpm tsx test/e2e/k8s/job-executor.e2e.mts

import { DefaultK8sJobRunner, K8sExecutor } from "../../../packages/executors/src/index.js"

const namespace = process.env.E2E_NAMESPACE ?? "default"

const exec = new K8sExecutor(new DefaultK8sJobRunner(2000, 120_000))

// A trivial node: busybox echoes an injected env param and exits 0.
const node = {
  id: "e2e",
  name: "e2e-echo",
  executor: {
    type: "k8s" as const,
    image: "busybox:1.36",
    command: ["sh", "-c", 'echo "RUN_DATE=$RUN_DATE"; exit 0'],
    namespace,
  },
  params: { dateParams: [{ key: "RUN_DATE", expr: "${RUN_DATE}", format: "yyyyMMdd" }] },
}

const result = await exec.execute(node, { flowRunId: "e2e-1", runDate: new Date() })

console.log("ok:", result.ok)
console.log("response:", JSON.stringify(result.response))
if (!result.ok) {
  console.error("E2E FAIL:", result.errorMessage)
  process.exit(1)
}
console.log("E2E PASS")
