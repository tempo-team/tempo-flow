// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Flow engine: DAG schema, validation, and interpretation.
 *
 * Uses explicit named re-exports (not `export *`) so bundlers (Vite/esbuild)
 * can statically detect the named exports from this CommonJS build.
 */

export {
  flowDefinitionSchema,
  flowEdgeSchema,
  flowNodeSchema,
  flowTriggerSchema,
} from "./schema.js"
export {
  type ValidationResult,
  FlowValidationError,
  assertValidFlowDefinition,
  entryNodes,
  validateFlowDefinition,
  validateFlowTrigger,
} from "./validate.js"
export { type NodeOutcome, getNode, outgoingTargets } from "./run.js"

export const FLOW_ENGINE_VERSION = "0.0.0"
