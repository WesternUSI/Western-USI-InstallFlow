---
name: original-srs
description: Loads the original client-supplied SRS for the Western USI Installer Workflow App (Bubble/Cloudflare-based, sent 2026-08-03) as historical reference. Use when the user asks what the client originally requested, wants to check the original spec/wireframe screen map/field names, or asks to "check the SRS" / "get the original requirements". Do NOT use this as the current spec — the real implementation (Convex + web/native) has diverged significantly.
---

# Original client SRS (historical reference)

This skill surfaces the **first** SRS the client sent, before this project's
current architecture existed. It is kept for historical/reference purposes
only — not as a current source of truth.

## What to do when this skill is invoked

1. Read `docs/reference/original-client-srs.md` in full.
2. Answer the user's question using that content.
3. If anything in it conflicts with the current codebase or with
   `docs/superpowers/specs/`/`docs/superpowers/plans/`, say so explicitly and
   defer to the code/current specs — do not silently prefer the old document.

## Critical context — read before answering anything

The original SRS describes a **Bubble.io + Cloudflare** build. This project
does **not** use Bubble or Cloudflare, and never will. It uses:

- **Convex** as the backend (database + functions + file storage), not Bubble.
- **Clerk** for auth, not a Bubble login.
- A **Vite/TanStack Router web app** (`apps/web/`) for office staff.
- An **Expo Router React Native app** (`apps/native/`) for installers.

A lot of the original SRS's functional scope (work order allocation,
equipment-needed screens, complete-install camera flow, completion emails,
team allocation) is **not yet built** in this codebase — the SRS describes
intent/history, not current state. Never propose Bubble- or
Cloudflare-specific solutions on the basis of this document.

Full deviation list and caveats are in the "Known deviations" section at the
top of `docs/reference/original-client-srs.md` itself — read that section
every time, since it may be updated as more drift is discovered.
