// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import js from "@eslint/js"
import tseslint from "typescript-eslint"

/**
 * Shared flat ESLint config for the tempo-flow monorepo. Mirrors the
 * krill-protocol convention of a single shared base so every app and package
 * lints by the same rules. Import this from each workspace's eslint.config.mjs.
 *
 * @type {import("eslint").Linter.Config[]}
 */
const base = [
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.turbo/**", "**/coverage/**", "**/.next/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { sourceType: "module" },
    },
    rules: {
      // Auto-fixable member sorting keeps import lists tidy without forcing a
      // declaration order that fights Prettier.
      "sort-imports": [
        "warn",
        {
          ignoreCase: false,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ["none", "all", "multiple", "single"],
          allowSeparatedGroups: false,
        },
      ],
      "no-console": ["error", { allow: ["warn", "error", "info"] }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_+$",
          varsIgnorePattern: "^_+$",
          caughtErrorsIgnorePattern: "^_+$",
        },
      ],
      // tempo-flow leans on `any` for Prisma/Nest interop in a few spots; keep
      // it off rather than warn-spamming. Tighten once those are typed.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
]

export default base
