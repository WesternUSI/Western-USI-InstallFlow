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
