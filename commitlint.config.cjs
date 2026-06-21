// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Conventional Commits. Examples:
 *   feat(scheduler): add second-level cron registration
 *   fix(executor): retry http timeouts with backoff
 *   docs: document multi-DB switching
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
      ],
    ],
    "subject-case": [0],
  },
}
