import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { deriveSiteDetailStatus, deriveWorkOrderStatus } from "./derive";

/**
 * Backfills the status keys added in `convex/derive.ts` onto rows written
 * before they existed.
 *
 * Without them a row is invisible to the status indexes, so a filtered `list`
 * returns nothing while the counts — which compute the status live — look
 * right. Run each mutation repeatedly until it reports `updated: 0`.
 *
 * Safe to re-run: rows that already carry the key are skipped.
 */

/** Rows per call, kept well inside one transaction's write budget. */
const BATCH = 200;

export const backfillSites = internalMutation({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("sites")
      .filter((q) => q.eq(q.field("detail_key"), undefined))
      .take(BATCH);

    for (const site of pending) {
      await ctx.db.patch(site._id, {
        detail_key: deriveSiteDetailStatus(site),
      });
    }

    return { updated: pending.length };
  },
});

export const backfillWorkOrders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("workorders")
      .filter((q) => q.eq(q.field("status_key"), undefined))
      .take(BATCH);

    for (const workOrder of pending) {
      await ctx.db.patch(workOrder._id, {
        status_key: deriveWorkOrderStatus(workOrder),
      });
    }

    return { updated: pending.length };
  },
});

/**
 * `password` and `personal_email` were dropped from the schema — passwords
 * are never stored, only ever shown once at invite/reset time, and the
 * personal-email field went unused once the forms stopped collecting it.
 * Existing rows still carry the old values until this strips them; a patch
 * with `undefined` deletes the field entirely rather than just clearing it.
 * Run repeatedly until it reports `updated: 0`.
 */
export const stripLegacyUserFields = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Neither field is in the schema anymore, so it can't be queried by —
    // fetched as loosely-typed records and checked in JS instead.
    const users = (await ctx.db.query("users").take(BATCH * 4)) as unknown as Record<
      string,
      unknown
    >[];
    const pending = users.filter((user) => "password" in user || "personal_email" in user).slice(0, BATCH);

    for (const user of pending) {
      const patch: Record<string, unknown> = { password: undefined, personal_email: undefined };
      await ctx.db.patch(user._id as Id<"users">, patch);
    }

    return { updated: pending.length };
  },
});
