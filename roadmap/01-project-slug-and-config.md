# 01 — Project Slug

## Goal

Introduce a stable, human-readable project slug (e.g. `prestigious-impala-84`) that identifies a Camox project across environments.

## Vite plugin config

The slug is passed as an option to the Camox Vite plugin:

```ts
camox({ projectSlug: "prestigious-impala-84" });
```

- Checked into git via `vite.config.ts` — every collaborator shares it.
- The slug is the cross-environment link between management, production backend, and local backend.
- No separate config file needed — the Vite plugin is already required, so this is zero additional setup.

## Backend schema change

Add a `slug` field to the `projects` table in the backend schema, indexed for lookup. All environment-crossing references use the slug, never Convex `_id`s.

## Where slugs are generated

Slugs are generated once, by the management backend, at project creation time. They never change.

## Depends on

Nothing — this is foundational. All other plans reference this.
