// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { Permission } from "@tempo-flow/shared-types"
import { describe, expect, it } from "vitest"
import { hasPermission } from "./auth"

describe("hasPermission", () => {
  const viewer: Permission[] = ["view:flow", "view:run"]
  const admin: Permission[] = ["manage:flow", "manage:user"]

  it("grants an exact action:resource match", () => {
    expect(hasPermission(viewer, "view", "flow")).toBe(true)
    expect(hasPermission(viewer, "execute", "flow")).toBe(false)
  })

  it("treats manage as a wildcard for the resource", () => {
    expect(hasPermission(admin, "edit", "flow")).toBe(true)
    expect(hasPermission(admin, "execute", "flow")).toBe(true)
    expect(hasPermission(admin, "view", "user")).toBe(true)
    expect(hasPermission(admin, "view", "setting")).toBe(false)
  })
})
