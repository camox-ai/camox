# 07 — `create-camox` CLI

## Goal

A CLI command (`npm create camox` or similar) that scaffolds a new Camox project, creating it in both management and production backend, and writing the `.camox.json` file.

## Flow

1. Prompt user for project name, domain, etc.
2. Authenticate with management (OAuth flow or API key)
3. Call management to create the project (management handles slug generation and backend sync per plans 02 and 03)
4. Receive the generated slug back
5. Scaffold the project directory with `.camox.json`, starter files, dependencies
6. Done — user runs `pnpm dev` and the local bootstrap (plan 06) + optional pull (plan 05) take care of the rest

## Slug generation

Happens server-side in management, not in the CLI. The CLI receives the slug after project creation.

## Depends on

- Plan 01 (`.camox.json` format)
- Plan 02 (management creates the project)
- Plan 03 (management syncs to production backend)
