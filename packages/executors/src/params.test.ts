// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { FlowNode } from "@tempo-flow/shared-types"
import { describe, expect, it } from "vitest"
import { resolveDateExpr, resolveNodeParams } from "./params.js"

// Local-time base date (avoids TZ flakiness with date-fns format).
const BASE = new Date(2026, 5, 20) // 2026-06-20

describe("resolveDateExpr", () => {
  it("resolves RUN_DATE to the base date", () => {
    expect(resolveDateExpr("${RUN_DATE}", BASE).getDate()).toBe(20)
  })

  it("applies day offsets", () => {
    expect(resolveDateExpr("${RUN_DATE-7d}", BASE).getDate()).toBe(13)
    expect(resolveDateExpr("${RUN_DATE+1d}", BASE).getDate()).toBe(21)
  })

  it("supports YESTERDAY / TOMORROW", () => {
    expect(resolveDateExpr("${YESTERDAY}", BASE).getDate()).toBe(19)
    expect(resolveDateExpr("${TOMORROW}", BASE).getDate()).toBe(21)
  })

  it("applies month offsets", () => {
    expect(resolveDateExpr("${RUN_DATE+1M}", BASE).getMonth()).toBe(6) // July (0-indexed)
  })

  it("throws on an invalid expression", () => {
    expect(() => resolveDateExpr("${BOGUS!!}", BASE)).toThrow()
  })
})

describe("resolveNodeParams", () => {
  const node: FlowNode = {
    id: "n1",
    name: "extract",
    executor: { type: "http", url: "https://x.test/r", method: "POST" },
    params: {
      static: { source: "orders" },
      dateParams: [
        { key: "startAt", expr: "${RUN_DATE-7d}", format: "yyyyMMdd" },
        { key: "yyyymm", expr: "${RUN_DATE}", format: "yyyyMM" },
      ],
    },
  }

  it("merges static + formatted date params", async () => {
    const params = await resolveNodeParams(node, BASE)
    expect(params).toEqual({ source: "orders", startAt: "20260613", yyyymm: "202606" })
  })

  it("applies manual overrides last (backfill)", async () => {
    const params = await resolveNodeParams(node, BASE, { startAt: "20260101" })
    expect(params.startAt).toBe("20260101")
  })

  it("evaluates a JSONata param expression against resolved params", async () => {
    const exprNode: FlowNode = {
      id: "n2",
      name: "x",
      executor: { type: "http", url: "https://x.test/r", method: "POST" },
      params: { static: { region: "kr", target: '={{ params.region & "-prod" }}' } },
    }
    const params = await resolveNodeParams(exprNode, BASE)
    expect(params.target).toBe("kr-prod")
  })
})
