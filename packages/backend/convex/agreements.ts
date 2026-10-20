import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { isValidIsoDate, requireCaller } from "./accreditations";
import { canViewCompliance, isAdminUser } from "./permissions";
import { addDays, businessToday } from "./whsDates";

/**
 * The signed subcontractor agreement (framework 4D, decision R5): one per
 * subcontractor at a time, earlier ones kept. Its status comes from the
 * review date (decision AD30): Due soon from 30 days before, as a policy
 * review (framework 7), and Missing when none is on file.
 */

const REVIEW_SOON_DAYS = 30;
const MAX_NOTES = 1000;

export type AgreementStatus = "current" | "due-soon" | "overdue" | "missing";

export function agreementStatus(latest: Doc<"subcontractor_agreements"> | null, today: string): AgreementStatus {
  if (latest === null) return "missing";
  if (latest.review_date < today) return "overdue";
  if (latest.review_date <= addDays(today, REVIEW_SOON_DAYS)) return "due-soon";
  return "current";
}

/** Every agreement on file for a subcontractor, oldest first. */
export async function agreementsOf(ctx: QueryCtx, subcontractorId: Id<"subcontractors">) {
  return await ctx.db
    .query("subcontractor_agreements")
    .withIndex("by_subcontractor", (q) => q.eq("subcontractor_id", subcontractorId))
    .collect();
}

async function requirePanel(ctx: QueryCtx) {
  const user = await requireCaller(ctx);
  if (!canViewCompliance(user)) throw new ConvexError("Only admins and management can open this.");
  return user;
}

async function requireAdmin(ctx: QueryCtx) {
  const user = await requireCaller(ctx);
  if (!isAdminUser(user)) throw new ConvexError("Only an administrator can update a subcontractor agreement.");
  return user;
}

async function nameOf(ctx: QueryCtx, id: Id<"users"> | undefined) {
  if (id === undefined) return undefined;
  const user = await ctx.db.get(id);
  return user === null ? "Removed user" : (user.name ?? user.email);
}

/** The current agreement and the earlier ones, for the subcontractor's page. */
export const forSubcontractor = query({
  args: { subcontractor_id: v.id("subcontractors") },
  handler: async (ctx, args) => {
    await requirePanel(ctx);
    const all = await agreementsOf(ctx, args.subcontractor_id);
    const latest = all[all.length - 1] ?? null;
    const describe = async (row: Doc<"subcontractor_agreements">) => ({
      id: row._id,
      signed_on: row.signed_on,
      review_date: row.review_date,
      file_name: row.file_name,
      file_url: await ctx.storage.getUrl(row.file_id),
      notes: row.notes,
      responsible: (await nameOf(ctx, row.responsible_user_id)) ?? "The admin list",
      uploaded_by: await nameOf(ctx, row.uploaded_by),
      uploaded_at: row._creationTime,
    });
    return {
      status: agreementStatus(latest, businessToday()),
      current: latest === null ? null : await describe(latest),
      previous: await Promise.all(all.slice(0, -1).reverse().map(describe)),
    };
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** The admin uploads a signed agreement (Figma SC09). The earlier one stays on file. */
export const adminSave = mutation({
  args: {
    subcontractor_id: v.id("subcontractors"),
    signed_on: v.string(),
    review_date: v.string(),
    responsible_user_id: v.optional(v.id("users")),
    notes: v.optional(v.string()),
    file_id: v.id("_storage"),
    file_name: v.string(),
    content_type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const subcontractor = await ctx.db.get(args.subcontractor_id);
    if (subcontractor === null || subcontractor.archived) throw new ConvexError("That subcontractor no longer exists.");
    if (!isValidIsoDate(args.signed_on)) throw new ConvexError("Select the date the agreement was signed.");
    if (!isValidIsoDate(args.review_date)) throw new ConvexError("Select the review date.");
    if (args.review_date <= args.signed_on) throw new ConvexError("The review date must be after the signing date.");
    const notes = args.notes?.trim() || undefined;
    if (notes !== undefined && notes.length > MAX_NOTES) throw new ConvexError(`Notes can be up to ${MAX_NOTES} characters.`);
    if (args.responsible_user_id !== undefined && (await ctx.db.get(args.responsible_user_id)) === null) {
      throw new ConvexError("That responsible person no longer exists. Choose someone else.");
    }
    if ((await ctx.db.system.get(args.file_id)) === null) throw new ConvexError("The agreement didn't finish uploading. Please try again.");

    await ctx.db.insert("subcontractor_agreements", {
      subcontractor_id: subcontractor._id,
      signed_on: args.signed_on,
      review_date: args.review_date,
      file_id: args.file_id,
      file_name: args.file_name,
      content_type: args.content_type,
      responsible_user_id: args.responsible_user_id,
      notes,
      uploaded_by: admin._id,
    });
  },
});

/** Every subcontractor's agreement status at once, for the management overview and entity list (decision AD43). */
export const statuses = query({
  args: {},
  handler: async (ctx) => {
    await requirePanel(ctx);
    const today = businessToday();
    const subcontractors = (await ctx.db.query("subcontractors").collect()).filter((row) => !row.archived);
    return await Promise.all(
      subcontractors.map(async (subcontractor) => {
        const all = await agreementsOf(ctx, subcontractor._id);
        return { subcontractor_id: subcontractor._id as string, status: agreementStatus(all[all.length - 1] ?? null, today) };
      }),
    );
  },
});
