// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// setupFiles hook: reset DB + Redis + fixture before every test so each test
// starts from a clean slate (seed data preserved). The API + infra are already
// up from the global setup.

import { beforeEach } from "vitest"
import { resetState } from "./reset"

beforeEach(async () => {
  await resetState()
})
