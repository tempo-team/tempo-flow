// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest"
import { Action, Resource, permission } from "./permissions.js"

describe("permission()", () => {
  it("composes action:resource", () => {
    expect(permission(Action.Execute, Resource.Flow)).toBe("execute:flow")
    expect(permission(Action.Manage, Resource.User)).toBe("manage:user")
  })
})
