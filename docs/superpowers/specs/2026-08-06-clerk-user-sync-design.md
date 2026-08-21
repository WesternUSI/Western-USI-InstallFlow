# Clerk → Convex User Sync — Design

## Purpose

Users are created in Clerk directly (not through this app's own sign-up
flow). When that happens, a Convex `users` table should automatically be
kept in sync via a Clerk webhook, so the rest of the app can look up app
data by a stable `clerk_id` foreign key.

Per explicit user decision, webhook signature verification (`svix`) is
**skipped** for this pass — the endpoint trusts any POST body it receives.
This is a known, accepted risk (flagged to the user before this decision):
anyone who discovers the webhook URL could POST a fabricated payload and
create/modify/delete rows in the `users` table.

## Convex schema

New table in `packages/backend/convex/schema.ts` (added alongside the
existing `sites` table, not replacing it):

```ts
users: defineTable({
  clerk_id: v.string(),
  email: v.string(),
  name: v.optional(v.string()),
  image_url: v.optional(v.string()),
}).index("by_clerk_id", ["clerk_id"])
```

## Webhook endpoint

New file `packages/backend/convex/http.ts`, registered at:

```
POST /clerk-users-webhook
```

Full URL once deployed: `${CONVEX_SITE_URL}/clerk-users-webhook`, i.e.
`https://scintillating-jellyfish-951.convex.site/clerk-users-webhook` for
this project's dev deployment (from `packages/backend/.env.local`).

Handles three Clerk event types (`data.type` in the webhook payload):
- `user.created` / `user.updated` → parses `data.data` into
  `{ clerk_id, email, name, image_url }` and calls internal mutation
  `upsertUser`.
- `user.deleted` → calls internal mutation `deleteUser` with `data.data.id`.
- Any other event type → ignored, responds 200 (so Clerk doesn't retry
  events this app doesn't care about).

Email extraction: Clerk's payload lists `email_addresses` as an array;
the primary one is identified by `primary_email_address_id` matching an
entry's `id`. Falls back to the first entry if no primary is marked.

Name extraction: `first_name` + `last_name` joined with a space, trimmed;
`undefined` if both are empty.

## Convex mutations

New file `packages/backend/convex/users.ts`:

- `internalMutation upsertUser(args: { clerk_id, email, name?, image_url? })`
  — looks up by `by_clerk_id` index; `patch` if found (all fields, so a
  cleared name/photo in Clerk clears it here too — same explicit-field
  pattern as `sites.ts`'s upsert), `insert` if not found.
- `internalMutation deleteUser(args: { clerk_id: string })` — looks up by
  `by_clerk_id`, deletes the doc if found, no-ops if not (webhook retries
  or out-of-order delivery shouldn't error).

Both are `internalMutation`, not `mutation` — they are only callable from
`http.ts` inside this Convex deployment, never from a client.

## Environment variables

**Convex** (set via `npx convex env set <NAME> <value>` or the Convex
Dashboard → Settings → Environment Variables — NOT `.env.local`, which only
holds deployment identity, not secrets):
- `CLERK_SECRET_KEY` — requested by the user; not read by any code in this
  pass (webhook verification is skipped, so nothing needs it yet). Stored
  for future use.
- `CLERK_JWT_ISSUER_DOMAIN` — already referenced by the pre-existing
  `convex/auth.config.ts`; confirm it's set if not already (unrelated to
  this feature, but required for Clerk auth to work at all).

**`apps/web/.env.local`** (new file, gitignored via root `.gitignore`'s
`.env*` pattern):
```
VITE_CONVEX_URL=https://scintillating-jellyfish-951.convex.cloud
VITE_CLERK_PUBLISHABLE_KEY=
```

**`apps/native/.env.local`** (new file, gitignored):
```
EXPO_PUBLIC_CONVEX_URL=https://scintillating-jellyfish-951.convex.cloud
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=
```

Both publishable-key values are left blank for the user to fill in from
their Clerk Dashboard (API Keys page) — not something this session has
access to.

## Out of scope (this spec)

- Webhook signature verification (`svix`) — explicitly skipped per user
  decision; can be added later without changing the schema or mutation
  shapes.
- Web login screen matching the native app's design, and any Next.js
  migration for `apps/web` — separate project, raised by the user but
  parked for its own design pass.
