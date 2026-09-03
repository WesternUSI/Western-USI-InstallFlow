---
name: breaking-change-check
description: Decides whether the current changes would break the installer app for someone who has NOT updated it — i.e. whether an old app build still works against the new backend. Use before `convex deploy`, when finishing a backend feature, or when the user asks "is this a breaking change", "will old versions still work", "do users need to update", "does this force an app update", or "will this break the app".
---

# Will this break an un-updated app?

The installer app (`apps/native/`) and the Convex backend (`packages/backend/convex/`)
deploy on **separate schedules**: the backend ships in minutes with `convex deploy`,
the app ships through TestFlight / the App Store / Play and takes days to reach every
installer. So at any moment there are **old app builds talking to the new backend**.

This skill answers one question: **would a build compiled BEFORE these changes still
work against the backend WITH these changes?** If not, the changes are breaking and
deploying them strands every installer who hasn't updated.

## Why only the backend contract matters

There is **no OTA / EAS Update** in this project (confirm: `grep expo-updates
apps/native/package.json` → nothing). JS/UI/navigation changes to `apps/native/`
only reach a device as a whole new native build. An old build simply doesn't contain
that code — it can't be "broken" by it. **Pure client-side changes are always safe
for old apps.**

The only cross-version hazard is the **client ↔ backend contract**: Convex function
signatures, return shapes the app reads, function names the app calls, schema fields,
and auth rules. So this check scopes to `packages/backend/convex/**`.

(If `expo-updates` is ever added, revisit — JS shipped over an OTA channel to an old
binary then becomes a second hazard surface.)

## Procedure

### 1. Get the diff scope

- Default: uncommitted + staged changes — `git diff HEAD -- packages/backend/convex/`.
- If the user names a base (a branch, `main`, a commit, "since this morning"), diff
  that instead: `git diff <base> -- packages/backend/convex/`.
- **No changes under `packages/backend/convex/`** → report:
  `SAFE — no backend contract changes. Client-only changes can't break an installed old app (no OTA).` Stop.

### 2. Build the "app actually calls this" set

Only functions the installer app invokes matter for the installer. Web-admin-only
functions are lower priority (see step 4).

```bash
grep -rhoE 'api\.[a-z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*' \
  apps/native/app apps/native/components apps/native/contexts \
  apps/native/hooks apps/native/lib | sort -u
```

Also check `apps/web/src` with the same grep if you need the web picture.

### 3. Classify every changed export against the checklist

For each `export const <name> = mutation|query|action(...)` (or schema table) touched
by the diff, decide 🔴 / 🟡 / 🟢. A change is only **relevant** if `<name>` is in the
app-calls set from step 2 (or it's a schema table the app writes/reads through one).

| Change to a function/schema the app uses | Verdict | Why an old app fails |
| --- | --- | --- |
| Add a **required** arg (`v.string()`, `v.id()`, `v.array()` … not `v.optional`) | 🔴 breaking | old app omits it → `ArgumentValidationError` |
| **Remove or rename** an arg the app still sends | 🔴 breaking | old app sends an unknown field → rejected |
| Narrow an arg's validator (`v.string()` → `v.union(v.literal(...))`, `v.number()` → `v.int64()`, add a regex/length, `v.optional` → required) | 🔴 breaking | old app's value no longer validates |
| Change an arg's **type** (`v.id()` → `v.array(v.id())`, string → object) | 🔴 breaking | shape mismatch → rejected |
| Add a **new optional** arg (`v.optional(...)`) | 🟢 safe | old app just doesn't send it |
| **Remove or rename** a query/mutation/action the app calls | 🔴 breaking | `api.x.y` resolves to nothing → error on every call |
| **Rename or remove a field** in a return object the app reads | 🔴 breaking | app reads `undefined`; often crashes on `.map` / `.length` / destructuring |
| **Change the type** of a returned field the app reads (e.g. `string` → `string[]`) | 🟡 check the app | does the app do string ops / `.map` / `.length` on it? if yes → breaking |
| **Add** a field to a return object | 🟢 safe | old app ignores it |
| Schema: **remove a field**, make an optional field **required**, or change a field's **type** | 🟡 check | breaks old-app mutations that insert/patch that table; breaks old-app reads if it expects the field |
| Schema: **add an optional field** / new index | 🟢 safe | |
| `throw new Error(...)` → `throw new ConvexError(...)` | 🟢 safe | `ConvexError extends Error`; the app's `catch` and `error.message` still work; nothing crashes |
| **New `ConvexError` message text** on an existing throw path | 🟢 safe | wording only |
| **New rejection path** in business logic (e.g. now rejects an already-completed order) | 🟡 usually safe | not a protocol break; the old app shows it as an error toast/alert. Only 🔴 if the old app assumed success and does something unsafe on the error path |
| **Tighten auth** on a function the app calls (now requires a role the installer lacks, or now calls `requireAdmin`) | 🔴 breaking | installer gets "not authorized" on a screen that used to work |
| New scheduled/internal function, `internalMutation`, `internalQuery`, migration | 🟢 safe | not client-reachable |
| Change to `email.ts`, `_generated`, comments, server-only helpers | 🟢 safe | |

### 4. Web admin (`apps/web/`)

Web-admin-only breaks are **usually moot** — confirm the deploy process: if `apps/web`
ships together with every `convex deploy`, an old web bundle never meets the new
backend. If web deploys independently, treat web-facing 🔴 the same as app-facing.
State the assumption in the report; don't silently ignore web.

### 5. Report

Lead with a one-line verdict:

- **`BREAKING — an un-updated installer app will fail`** (list which function(s), and what the installer sees), or
- **`SAFE — old app builds keep working`**, or
- **`SAFE for the app, BREAKING for web admin`** (with the deploy-process caveat).

Then a short table: `function/table | change | verdict | effect on old app`, `file:line`
for each finding. Most-severe first.

If **BREAKING**, give the options explicitly:

1. **Make it backward-compatible** (preferred) — see patterns below. Then it's 🟢 and
   you can deploy the backend anytime.
2. **Sequence the rollout** — ship the new app build, wait until adoption is high
   (check with the client), *then* `convex deploy`. Fragile; someone always lags.
3. **Force-update gate** — only if 1 and 2 are impossible. Out of scope here; that's a
   separate feature.

## Backward-compatibility patterns

- **New required arg** → make it `v.optional(...)` and default it in the handler.
- **Renamed / removed arg** → keep the old name as `v.optional`, accept either:
  `const photos = args.photos ?? (args.photo ? [args.photo] : []);`
- **Renamed return field** → return **both** keys for a deprecation window; drop the
  old one only after the old app is gone.
- **Removed function** → keep a thin wrapper export under the old name that calls the
  new one.
- **Type change on a returned field** → add a new field with the new type, leave the
  old field, migrate readers, remove later.
- **Tightened auth** → usually can't be softened without defeating the point; this one
  genuinely needs a coordinated app release or a force-update gate.

## Known example (reference)

The `completeWorkOrder` change on 2026-08-31 is the canonical breaking case for this
repo: `photo: v.id("_storage")` → `photos: v.array(v.id("_storage"))`. Old app sends
`photo`, new backend demands `photos`, installer gets a generic "Server Error" and
cannot complete installs. Fix is the "renamed / removed arg" pattern above.
