// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { ConfigService } from "@nestjs/config"
import { describe, expect, it, vi } from "vitest"
import { encryptSecret } from "../common/crypto"
import type { PrismaService } from "../prisma/prisma.service"
import { SecretService } from "./secret.service"

const MASTER = "0123456789abcdef0123456789abcdef"
const config = { get: () => MASTER } as unknown as ConfigService

describe("SecretService", () => {
  it("list selects metadata only — never the value", async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const prisma = { secret: { findMany } } as unknown as PrismaService
    await new SecretService(prisma, config).list("global", "")
    const select = findMany.mock.calls[0][0].select
    expect(select).not.toHaveProperty("valueEnc")
    expect(select).toMatchObject({ key: true, scope: true })
  })

  it("encrypts the value on upsert (no plaintext stored)", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "s1" })
    const prisma = { secret: { upsert } } as unknown as PrismaService
    await new SecretService(prisma, config).upsert({
      key: "TOKEN",
      value: "s3cr3t",
      createdBy: "u1",
    })
    const data = upsert.mock.calls[0][0].create
    expect(data.valueEnc).not.toContain("s3cr3t")
    expect(data.valueEnc.length).toBeGreaterThan(0)
  })

  it("resolveForFlow decrypts and lets flow scope override global", async () => {
    const rows = [
      { scope: "global", flowId: "", key: "A", valueEnc: encryptSecret("global-a", MASTER) },
      { scope: "global", flowId: "", key: "B", valueEnc: encryptSecret("global-b", MASTER) },
      { scope: "flow", flowId: "f1", key: "B", valueEnc: encryptSecret("flow-b", MASTER) },
    ]
    const findMany = vi.fn().mockResolvedValue(rows)
    const prisma = { secret: { findMany } } as unknown as PrismaService
    const resolved = await new SecretService(prisma, config).resolveForFlow("f1")
    expect(resolved).toEqual({ A: "global-a", B: "flow-b" }) // flow B overrides global B
  })
})
