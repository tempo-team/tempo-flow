// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { FlowNode } from "@tempo-flow/shared-types"
import { addDays, addHours, addMinutes, addMonths, addYears, format as formatDate } from "date-fns"
import jsonata from "jsonata"

/**
 * Resolve a date expression against a base run date.
 *
 * Grammar: `${BASE[±No]}` where BASE is one of RUN_DATE | TODAY | NOW |
 * YESTERDAY | TOMORROW and `±No` is an optional offset like `-7d`, `+1M`.
 * Units: `d` days, `w` weeks, `M` months, `y` years, `h` hours, `m` minutes.
 *
 * Examples: `${RUN_DATE}`, `${RUN_DATE-7d}`, `${YESTERDAY}`, `${RUN_DATE+1M}`.
 */
export function resolveDateExpr(expr: string, baseDate: Date): Date {
  const inner = expr.trim().replace(/^\$\{/, "").replace(/\}$/, "")
  const match = inner.match(/^([A-Z_]+)\s*([+-]\s*\d+\s*[dwMyhm])?$/)
  if (!match) {
    throw new Error(`Invalid date expression: ${expr}`)
  }

  const [, base, offset] = match
  let date = baseFromToken(base, baseDate)
  if (offset) date = applyOffset(date, offset.replace(/\s+/g, ""))
  return date
}

function baseFromToken(token: string, baseDate: Date): Date {
  switch (token) {
    case "RUN_DATE":
    case "TODAY":
    case "NOW":
      return new Date(baseDate)
    case "YESTERDAY":
      return addDays(baseDate, -1)
    case "TOMORROW":
      return addDays(baseDate, 1)
    default:
      throw new Error(`Unknown date token: ${token}`)
  }
}

function applyOffset(date: Date, offset: string): Date {
  const m = offset.match(/^([+-])(\d+)([dwMyhm])$/)
  if (!m) throw new Error(`Invalid date offset: ${offset}`)
  const sign = m[1] === "-" ? -1 : 1
  const n = sign * Number(m[2])
  switch (m[3]) {
    case "d":
      return addDays(date, n)
    case "w":
      return addDays(date, n * 7)
    case "M":
      return addMonths(date, n)
    case "y":
      return addYears(date, n)
    case "h":
      return addHours(date, n)
    case "m":
      return addMinutes(date, n)
    default:
      throw new Error(`Unknown offset unit: ${m[3]}`)
  }
}

/** Context available to param/`forEach` JSONata expressions. */
export interface ParamContext {
  runDate: Date
  /** Manual-run overrides applied on top of static + date params. */
  overrides?: Record<string, string>
  /** Current fan-out item (set for fan-out node instances). */
  item?: unknown
  /** Upstream node outputs by node id (`nodes.<id>.output` style access). */
  nodes?: Record<string, unknown>
}

/**
 * Resolve a node's effective params: `static` values plus formatted
 * `dateParams`, with manual-run overrides applied last. Any value of the form
 * `={{ <jsonata> }}` is evaluated against `{ runDate, now, params, item, nodes }`,
 * enabling dynamic params like `={{ params.region & "-prod" }}` or, inside a
 * fan-out instance, `={{ item.id }}`.
 */
export async function resolveNodeParams(
  node: FlowNode,
  ctx: ParamContext,
): Promise<Record<string, string>> {
  const result: Record<string, string> = { ...(node.params?.static ?? {}) }
  for (const dp of node.params?.dateParams ?? []) {
    const date = resolveDateExpr(dp.expr, ctx.runDate)
    result[dp.key] = formatDate(date, dp.format)
  }
  Object.assign(result, ctx.overrides ?? {})

  const context = {
    runDate: ctx.runDate.toISOString(),
    now: new Date().toISOString(),
    params: { ...result },
    item: ctx.item,
    nodes: ctx.nodes ?? {},
  }
  for (const [key, value] of Object.entries(result)) {
    const match = /^=\{\{([\s\S]+)\}\}$/.exec(value)
    if (!match) continue
    try {
      const out = await jsonata(match[1].trim()).evaluate(context)
      result[key] = out == null ? "" : typeof out === "object" ? JSON.stringify(out) : String(out)
    } catch (err) {
      throw new Error(`Param "${key}" expression failed: ${(err as Error).message}`)
    }
  }
  return result
}

/**
 * Evaluate a raw JSONata expression (e.g. a node's `forEach`) against the
 * run context. Returns whatever the expression yields (used for fan-out arrays).
 */
export async function evaluateExpression(
  expr: string,
  ctx: { runDate: Date; params?: Record<string, string>; nodes?: Record<string, unknown> },
): Promise<unknown> {
  const context = {
    runDate: ctx.runDate.toISOString(),
    now: new Date().toISOString(),
    params: ctx.params ?? {},
    nodes: ctx.nodes ?? {},
  }
  return jsonata(expr).evaluate(context)
}
