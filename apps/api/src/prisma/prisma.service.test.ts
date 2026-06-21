// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { beforeAll, describe, expect, it } from "vitest"
import { PrismaService } from "./prisma.service"

beforeAll(() => {
  // PrismaClient reads the datasource URL from env on construction.
  process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/test"
})

describe("PrismaService", () => {
  it("inherits the PrismaClient query API", () => {
    const service = new PrismaService()
    // $connect/$disconnect come from PrismaClient; asserting them avoids
    // deep-matching the Prisma proxy (which overflows vitest matchers).
    expect(typeof service.$connect).toBe("function")
    expect(typeof service.$disconnect).toBe("function")
  })

  it("exposes module lifecycle hooks", () => {
    const service = new PrismaService()
    expect(typeof service.onModuleInit).toBe("function")
    expect(typeof service.onModuleDestroy).toBe("function")
  })
})
