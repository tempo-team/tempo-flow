// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { AuthPrincipal } from "@tempo-flow/shared-types"
import { describe, expect, it } from "vitest"
import { AbilityFactory } from "./ability.factory"

const factory = new AbilityFactory()

function principal(permissions: string[]): AuthPrincipal {
  return { userId: "u1", email: "u@x", roles: [], permissions: permissions as never }
}

describe("AbilityFactory", () => {
  it("grants exactly the listed permissions for a viewer", () => {
    const ability = factory.createForPrincipal(principal(["view:flow", "view:run", "view:history"]))
    expect(ability.can("view", "flow")).toBe(true)
    expect(ability.can("execute", "flow")).toBe(false)
    expect(ability.can("edit", "flow")).toBe(false)
    expect(ability.can("manage", "user")).toBe(false)
  })

  it("lets an operator execute but not manage users", () => {
    const ability = factory.createForPrincipal(
      principal(["execute:flow", "view:flow", "execute:run", "view:run"]),
    )
    expect(ability.can("execute", "flow")).toBe(true)
    expect(ability.can("manage", "user")).toBe(false)
  })

  it("treats manage as a wildcard action (admin)", () => {
    const ability = factory.createForPrincipal(principal(["manage:flow"]))
    expect(ability.can("edit", "flow")).toBe(true)
    expect(ability.can("execute", "flow")).toBe(true)
    expect(ability.can("view", "flow")).toBe(true)
    // but not on another resource
    expect(ability.can("edit", "user")).toBe(false)
  })
})
