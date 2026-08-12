import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx, mutation, query } from "./_generated/server";
import { findSiteForPanelSplit } from "./panelIds";

const workOrderRowValidator = v.object({
  contract_id: v.string(),
  advertiser_campaign: v.string(),
  contracted_panel_id: v.string(),
  panel_split: v.string(),
  site: v.string(),
  panel_name: v.string(),
  quantity: v.optional(v.number()),
  format: v.optional(v.string()),
  size: v.optional(v.string()),
  proposed_install_date: v.optional(v.string()),
  end_date: v.optional(v.string()),
  comments: v.optional(v.string()),
  existing_advertiser: v.optional(v.string()),
  area_progress: v.optional(v.string()),
  schedule: v.optional(v.string()),
  priority: v.boolean(),
});

async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("Not authenticated");
  }
  return identity;
}

function summarise(doc: Doc<"imports">) {
  return {
    _id: doc._id,
    name: doc.name,
    file_name: doc.file_name,
    upload_date: doc.upload_date,
    imported_at: doc.imported_at,
    imported_by_name: doc.imported_by_name,
    total_rows: doc.total_rows,
    missing_sites: doc.missing_sites,
  };
}

/**
 * Records one Installation Schedule import: an `imports` summary row plus one
 * `workorders` row per parsed line.
 *
 * Site matching is redone here rather than trusted from the client, and the
 * matched site's area is snapshotted onto each work order as `train_line`.
 */
export const createImport = mutation({
  args: {
    file_name: v.string(),
    upload_date: v.string(),
    rows: v.array(workOrderRowValidator),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();

    const sites = await Promise.all(
      args.rows.map((row) => findSiteForPanelSplit(ctx, row.panel_split)),
    );
    const missingSites = sites.filter((site) => site === null).length;

    const importId: Id<"imports"> = await ctx.db.insert("imports", {
      name: `Import-Data-${args.upload_date}`,
      file_name: args.file_name,
      upload_date: args.upload_date,
      imported_at: Date.now(),
      imported_by: user?._id,
      imported_by_name: user?.name ?? identity.name ?? identity.email ?? "Unknown user",
      total_rows: args.rows.length,
      missing_sites: missingSites,
    });

    for (let i = 0; i < args.rows.length; i++) {
      const site = sites[i];
      await ctx.db.insert("workorders", {
        ...args.rows[i],
        import_id: importId,
        upload_date: args.upload_date,
        current_status: "pending",
        assigned_team: [],
        site_id: site?._id,
        missing_value: site === null,
        train_line: site?.area_progress,
      });
    }

    return { import_id: importId, inserted: args.rows.length, missing_sites: missingSites };
  },
});

/** The most recent import, used for the dashboard summary card. */
export const latest = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);

    const doc = await ctx.db.query("imports").withIndex("by_imported_at").order("desc").first();
    return doc === null ? null : summarise(doc);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);

    const docs = await ctx.db.query("imports").withIndex("by_imported_at").order("desc").collect();
    return docs.map(summarise);
  },
});
