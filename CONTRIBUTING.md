# Contributing to tempo-flow

Thanks for your interest in contributing! This document explains how to get started
and the policies that apply to contributions.

## License

tempo-flow is licensed under the [Apache License 2.0](./LICENSE). By contributing,
you agree that your contributions will be licensed under the same terms.

## Contributor License Agreement (CLA)

To keep the project's future licensing options open (including the ability to offer
a managed/enterprise edition later), all contributors must sign a lightweight CLA
before their pull request can be merged.

- The CLA is handled automatically by **CLA Assistant** on each pull request.
- On your first PR, a bot will comment with a link; signing is a one-time click.
- The CLA grants the project the right to relicense your contribution; you retain
  copyright of your work.

> If you cannot sign the CLA, please open an issue to discuss alternatives before
> submitting code.

## Development setup

```bash
pnpm install      # install all workspace dependencies (+ husky hooks)
make build        # build all packages and apps
make check        # typecheck + lint + test
```

Useful scripts (root `package.json`):

| Script                        | Purpose                             |
| ----------------------------- | ----------------------------------- |
| `pnpm dev`                    | Run all apps in watch mode (turbo)  |
| `pnpm lint` / `pnpm lint:fix` | Lint (and auto-fix) every workspace |
| `pnpm typecheck`              | Type-check every workspace          |
| `pnpm test`                   | Run all unit tests (Vitest)         |
| `pnpm check`                  | typecheck + lint + test in one go   |
| `pnpm format`                 | Prettier write                      |

Linting is centralized in the shared **`@tempo-flow/eslint-config`** package; each
workspace's `eslint.config.mjs` re-exports its `base`. Adjust rules there so every
app and package stays consistent.

## Branches

- **`main`** — stable, release-ready. Protected; changes land via reviewed PRs.
- **`develop`** — integration branch for ongoing work; base your feature branches
  here and open PRs against `develop`.
- **`feature/<short-name>`**, **`fix/<short-name>`** — short-lived topic branches
  cut from `develop`.

CI runs on every pushed branch and on PRs targeting `main` or `develop`.

## Commit messages

This repo uses [Conventional Commits](https://www.conventionalcommits.org/),
enforced by `commitlint` via a Husky `commit-msg` hook. Format:

```
<type>(<optional scope>): <subject>
```

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
`build`, `ci`, `chore`, `revert`. Example: `feat(scheduler): add second-level cron`.

A Husky `pre-commit` hook runs `lint-staged` (ESLint `--fix` + Prettier) on staged
files, so formatting/lint issues are fixed before they land.

## Source file headers

New source files should include the Apache 2.0 header:

```ts
// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
```

## Pull request guidelines

- Keep PRs focused and reasonably small.
- Add tests for new behavior (`make test`).
- Run `make format` before committing.
- Ensure `make check` passes locally.

## Code of Conduct

Be respectful and constructive. Harassment or abuse of any kind is not tolerated.
