<!--
Copyright 2026 The tempo-flow Authors
SPDX-License-Identifier: Apache-2.0
-->

# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Instead, report privately via [GitHub Security Advisories](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
("Report a vulnerability" on the repository's **Security** tab), or email the
maintainers if an address is listed in the repository profile.

We aim to acknowledge reports within 72 hours and to ship a fix or mitigation
for confirmed issues as quickly as is practical, coordinating disclosure with
the reporter.

## Hardening checklist for operators

tempo-flow ships with development defaults that **must** be changed before
exposing it to a network:

- Set strong `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.
- Set a unique 32-byte `SETTINGS_ENCRYPTION_KEY` (notification secrets are
  encrypted at rest with AES-256-GCM using this key).
- Change the seeded admin password (`SEED_ADMIN_PASSWORD`) immediately after
  first login.
- Restrict network access to Postgres and Redis.
- Run behind TLS (terminate at your ingress / reverse proxy).

## Supported versions

This project is in early development; security fixes target the `main` branch.
