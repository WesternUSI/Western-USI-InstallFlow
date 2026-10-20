import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireCaller } from "./accreditations";
import { canViewCompliance, isAdminUser } from "./permissions";

/**
 * WHS settings the admin can change (decision AD47). For now one: how many
 * days an item stays overdue before management is emailed once (framework 7
 * "escalate to management after a configurable period"). It applies to
 * accreditations, documents, first-aid kits, insurance and vehicles alike.
 */

export const DEFAULT_ESCALATE_AFTER_DAYS = 14;
const MIN_DAYS = 1;
const MAX_DAYS = 90;

/** The escalation period in force: the admin's setting, or 14 days. */
export async function escalateAfterDays(ctx: QueryCtx): Promise<number> {
  const settings = await ctx.db.query("whs_settings").first();
  return settings?.escalate_after_days ?? DEFAULT_ESCALATE_AFTER_DAYS;
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCaller(ctx);
    if (!canViewCompliance(user)) throw new ConvexError("Only admins and management can open this.");
    const settings = await ctx.db.query("whs_settings").first();
    const updatedBy = settings?.updated_by === undefined ? null : await ctx.db.get(settings.updated_by);
    return {
      escalate_after_days: settings?.escalate_after_days ?? DEFAULT_ESCALATE_AFTER_DAYS,
      updated_by: updatedBy === null ? undefined : (updatedBy.name ?? updatedBy.email),
      updated_at: settings?.updated_at,
    };
  },
});

export const setEscalateAfterDays = mutation({
  args: { days: v.number() },
  handler: async (ctx, args) => {
    const user = await requireCaller(ctx);
    if (!isAdminUser(user)) throw new ConvexError("Only an administrator can change when management is emailed.");
    if (!Number.isInteger(args.days) || args.days < MIN_DAYS || args.days > MAX_DAYS) {
      throw new ConvexError(`Enter a whole number of days from ${MIN_DAYS} to ${MAX_DAYS}.`);
    }
    const settings = await ctx.db.query("whs_settings").first();
    const patch = { escalate_after_days: args.days, updated_by: user._id, updated_at: Date.now() };
    if (settings === null) await ctx.db.insert("whs_settings", patch);
    else await ctx.db.patch(settings._id, patch);
  },
});
