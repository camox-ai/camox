# 04 — Environment-Aware File Storage

## Goal

Local dev should work without Bunny credentials. File uploads in dev use Convex's built-in storage. Production uses Bunny via convex-fs as it does today.

## How it works

The `fs.ts` config checks for the presence of `BUNNY_API_KEY`:

- **Present** → Bunny storage config (production)
- **Absent** → built-in Convex storage (local dev)

## Impact on `commitFile`

The `commitFile` mutation currently uses `buildDownloadUrl` from convex-fs to generate the URL. In dev with built-in storage, it should use `ctx.storage.getUrl()` instead. This requires a small branch in the mutation based on the storage mode.

The `url` field on the files table abstracts the difference — blocks render whatever URL is stored regardless of origin.

## Impact on `deleteFile`

Deleting a file in dev only removes it from local Convex storage. No CDN interaction. Production Bunny blobs are untouched.

## No Bunny env vars needed for local dev

Users running `--local` do not set any Bunny environment variables. This prevents accidental CDN operations and key leakage.

## Depends on

Nothing — can be implemented independently. But plan 05 (pull from prod) relies on this being in place so that pulled files land in local storage.
