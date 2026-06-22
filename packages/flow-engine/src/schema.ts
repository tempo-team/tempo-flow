// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod"

const httpExecutorSchema = z.object({
  type: z.literal("http"),
  url: z.string().url(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  headers: z.record(z.string(), z.string()).optional(),
  paramsIn: z.enum(["query", "body"]).optional(),
})

const k8sExecutorSchema = z.object({
  type: z.literal("k8s"),
  image: z.string().min(1),
  command: z.array(z.string()).optional(),
  args: z.array(z.string()).optional(),
  namespace: z.string().optional(),
  paramsAs: z.enum(["env", "args"]).optional(),
})

const subflowExecutorSchema = z.object({
  type: z.literal("subflow"),
  flowId: z.string().min(1),
})

const executorSchema = z.discriminatedUnion("type", [
  httpExecutorSchema,
  k8sExecutorSchema,
  subflowExecutorSchema,
])

const dateParamSchema = z.object({
  key: z.string().min(1),
  expr: z.string().min(1),
  format: z.string().min(1),
})

const nodeParamsSchema = z.object({
  static: z.record(z.string(), z.string()).optional(),
  dateParams: z.array(dateParamSchema).optional(),
})

const retrySchema = z.object({
  max: z.number().int().min(0),
  backoff: z.enum(["fixed", "exponential"]),
  delayMs: z.number().int().min(0),
})

export const flowNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  executor: executorSchema,
  params: nodeParamsSchema.optional(),
  retry: retrySchema.optional(),
  timeoutMs: z.number().int().positive().optional(),
})

export const flowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  on: z.enum(["success", "failure", "always"]),
})

export const flowDefinitionSchema = z.object({
  nodes: z.array(flowNodeSchema),
  edges: z.array(flowEdgeSchema),
})

export const flowTriggerSchema = z.object({
  type: z.enum(["cron", "manual"]),
  expr: z.string().optional(),
})
