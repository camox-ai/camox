# 02 — Management Projects Table

## Goal

Make the management backend (`packages/backend-management/convex`) the source of truth for the project lifecycle — creation, listing, billing, deletion. The backend (`packages/backend-content/convex`) keeps its own `projects` table for content scoping, but management orchestrates.

## Management schema

Add a `projects` table to `packages/backend-management/convex/schema.ts`:

- `slug` — the stable project slug (from plan 01)
- `name`, `domain`
- `organizationId` — links to Better Auth org
- `plan`, `billingStatus` — billing fields (can start as optional/placeholder)
- `createdAt`, `updatedAt`

Indexed by `slug` and `organizationId`.

## What management owns

- Project CRUD exposed to the web app UI
- Listing projects for an organization
- Billing checks before project creation
- Orchestrating sync to the production backend (plan 03)
- Authorizing pull requests from local dev (plan 05)

## What management does NOT own

- Content storage (pages, blocks, layouts, files) — that stays in backend
- Content access control — backend handles that via `projectId`

## Depends on

- Plan 01 (slug as the shared identifier)
