<!--
Copyright 2026 The tempo-flow Authors
SPDX-License-Identifier: Apache-2.0
-->

# Architecture

tempo-flow is a TypeScript monorepo (Turborepo + pnpm). A flow is a **DAG stored
as JSON** ("workflow-as-data"): the same definition is rendered by the web UI and
interpreted by the execution engine.

## Layout

```
apps/
  api/   NestJS — auth/RBAC, flow CRUD, scheduler, queue producer + worker, run history, notifications
  web/   Vite + React — login, dashboard, React Flow DAG visualization, run history
packages/
  shared-types/   DTOs, permission + RunStatus enums, JSON helpers (shared by api + web)
  flow-engine/    DAG schema (Zod), validation (cycle/endpoint checks), traversal helpers
  executors/      JobExecutor interface + HTTP and Kubernetes implementations
  eslint-config/  shared flat ESLint config
prisma/   schema (multi-DB) + migrations + seed
docker/   Dockerfiles, compose, nginx, entrypoint
```

## Request → run lifecycle

1. **Schedule**: `SchedulerService` registers Croner jobs for `enabled` cron flows.
   On tick it takes a Redis lock (dedup across instances), enforces the overlap
   policy, creates a `FlowRun`, and enqueues a BullMQ `flow-run` job.
2. **Execute**: a BullMQ `Worker` (`FlowProcessor`) calls `RunService.executeRun`,
   which loads the DAG and hands it to the `ExecutionEngine`.
3. **Engine**: starts at entry nodes, runs each node via the matching executor
   (with retry/backoff), records a `NodeRun`, then follows outgoing edges whose
   condition matches the outcome (`success`/`failure`/`always`) — fan-out and
   conditional branching.
4. **Notify**: on completion `RunService` emits `flow.run.finished`;
   `NotificationListener` dispatches to enabled channels.

## Extension points

### Add an executor

Implement `JobExecutor` (`packages/executors/src/executor.ts`):

```ts
export interface JobExecutor {
  readonly type: ExecutorType
  execute(node: FlowNode, ctx: RunContext): Promise<ExecResult>
}
```

Then register it in the executors map in
[`apps/api/src/run/run.service.ts`](../apps/api/src/run/run.service.ts) (e.g.
`{ http: ..., k8s: ..., yourType: new YourExecutor() }`) and add the variant to
`ExecutorConfig` in `packages/shared-types/src/flow.ts`. See `HttpExecutor` and
`K8sExecutor` as references.

### Add a notification channel

Implement `NotificationStrategy`
(`apps/api/src/notification/notification.types.ts`):

```ts
export interface NotificationStrategy {
  readonly channel: string
  send(payload: NotificationPayload): Promise<void>
}
```

Add one branch to `NotificationFactory.build`
([`notification.factory.ts`](../apps/api/src/notification/notification.factory.ts))
and extend the settings config/DTO. Keep secrets encrypted via `SettingService`.
See `SlackStrategy` / `TelegramStrategy`.

## Conventions

- Tests are colocated as `*.test.ts` (Vitest).
- New source files carry the Apache 2.0 header (see `CONTRIBUTING.md`).
- JSON columns are stored as strings and (de)serialized via `toJson` / `fromJson`
  in `shared-types` so the schema stays portable across Postgres/MySQL/SQLite.
