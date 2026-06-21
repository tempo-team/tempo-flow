// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Swap the Prisma datasource provider in prisma/schema.prisma to match
 * DATABASE_PROVIDER (default: postgresql). Prisma does not allow env() for the
 * datasource `provider`, so we rewrite the marked line instead.
 *
 * Usage: node scripts/set-db-provider.mjs [provider]
 *   provider: postgresql | mysql | sqlite (falls back to $DATABASE_PROVIDER)
 */

import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const SUPPORTED = ["postgresql", "mysql", "sqlite"]
const provider = (process.argv[2] ?? process.env.DATABASE_PROVIDER ?? "postgresql").toLowerCase()

if (!SUPPORTED.includes(provider)) {
  console.error(`Unsupported provider "${provider}". Use one of: ${SUPPORTED.join(", ")}`)
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))
const schemaPath = join(here, "..", "prisma", "schema.prisma")
const schema = readFileSync(schemaPath, "utf8")

const marker = "// DB_PROVIDER"
let found = false
const next = schema
  .split("\n")
  .map((line) => {
    if (!line.includes(marker)) return line
    found = true
    return `  provider = "${provider}" ${marker} (managed by scripts/set-db-provider.mjs)`
  })
  .join("\n")

if (!found) {
  console.error(`Could not find the "${marker}" marker in schema.prisma`)
  process.exit(1)
}

writeFileSync(schemaPath, next)
console.log(`schema.prisma datasource provider set to "${provider}"`)
