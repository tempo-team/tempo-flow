<!--
Copyright 2026 The tempo-flow Authors
SPDX-License-Identifier: Apache-2.0
-->

# Kubernetes E2E (minikube)

Validates that `K8sExecutor` + `DefaultK8sJobRunner` create a real Kubernetes
Job, inject resolved params (env), detect completion, and collect logs.

## Prerequisites

- [minikube](https://minikube.sigs.k8s.io/) running: `minikube start`
- `kubectl` pointing at the minikube context
- Workspace built: `pnpm build`

## Run

```bash
make e2e-k8s
# or directly:
pnpm tsx test/e2e/k8s/job-executor.e2e.mts
```

The test runs a `busybox` Job that echoes an injected `RUN_DATE` env var and
exits 0, then asserts the executor reports success. A non-zero exit (e.g. an
image that fails) is detected as a failed node.

## CI

A `minikube` job can be added to `.github/workflows/ci.yml` using
`medyagh/setup-minikube` before invoking `make e2e-k8s`.
