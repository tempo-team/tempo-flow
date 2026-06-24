// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Direct Prisma client (root @prisma/client) for DB assertions and per-test
// truncation. Points at the isolated E2E database. Tables holding seed data
// (User/Role/Permission + their joins) are preserved so login keeps working;
// everything flow/run-related is truncated between tests.

import { PrismaClient } from "@prisma/client"
import { DATABASE_URL } from "./config"

let client: PrismaClient | undefined

export function db(): PrismaClient {
  if (!client) {
    client = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } })
  }
  return client
}

export async function closeDb(): Promise<void> {
  await client?.$disconnect()
  client = undefined
}

/**
 * Tables truncated between tests. Order doesn't matter — RESTART IDENTITY CASCADE
 * handles FKs. Postgres folds unquoted identifiers to lowercase, so Prisma's
 * PascalCase table names must be quoted.
 */
const TRUNCATE_TABLES = [
  "NodeRun",
  "FlowRun",
  "ApprovalRequest",
  "LlmAgentState",
  "FlowVersion",
  "FlowWebhook",
  "FlowEventTrigger",
  "Flow",
  "Secret",
  "SystemSetting",
]

export async function truncateAll(): Promise<void> {
  const quoted = TRUNCATE_TABLES.map((t) => `"${t}"`).join(", ")
  await db().$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`)
}
