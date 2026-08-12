import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx, mutation, query } from "./_generated/server";
import { deriveWorkOrderStatus, workOrderSearchText } from "./derive";
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
 * Starts one Installation Schedule import.
 *
 * A large schedule is written over several `addWorkOrders` calls rather than
 * one, because a Convex mutation is a single transaction with a bounded number
 * of reads and writes. The summary row is created up front with zero totals and
 * filled in by `finalizeImport` once every batch has landed.
 */
export const createImport = mutation({
  args: {
    file_name: v.string(),
    upload_date: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();

    const importId: Id<"imports"> = await ctx.db.insert("imports", {
      name: `Import-Data-${args.upload_date}`,
      file_name: args.file_name,
      upload_date: args.upload_date,
      imported_at: Date.now(),
      imported_by: user?._id,
      imported_by_name: user?.name ?? identity.name ?? identity.email ?? "Unknown user",
      total_rows: 0,
      missing_sites: 0,
    });

    return importId;
  },
});

/**
 * Writes one batch of work orders for an in-progress import.
 *
 * Site matching is redone here rather than trusted from the client, and the
 * matched site's area is snapshotted onto each row as `train_line`.
 */
export const addWorkOrders = mutation({
  args: {
    import_id: v.id("imports"),
    rows: v.array(workOrderRowValidator),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const importDoc = await ctx.db.get(args.import_id);
    if (importDoc === null) {
      throw new Error("Import not found");
    }

    const sites = await Promise.all(
      args.rows.map((row) => findSiteForPanelSplit(ctx, row.panel_split)),
    );

    for (let i = 0; i < args.rows.length; i++) {
      const site = sites[i];
      const row = {
        ...args.rows[i],
        import_id: args.import_id,
        upload_date: importDoc.upload_date,
        current_status: "pending" as const,
        assigned_team: [] as string[],
        site_id: site?._id,
        missing_value: site === null,
        train_line: site?.area_progress,
      };

      await ctx.db.insert("workorders", {
        ...row,
        // Filtering happens inside an index, so these are written with the row.
        search_text: workOrderSearchText(row),
        status_key: deriveWorkOrderStatus(row),
      });
    }

    return {
      inserted: args.rows.length,
      missing_sites: sites.filter((site) => site === null).length,
    };
  },
});

/** Fills in the summary totals once every batch has been written. */
export const finalizeImport = mutation({
  args: {
    import_id: v.id("imports"),
    total_rows: v.number(),
    missing_sites: v.number(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const { import_id, ...totals } = args;
    await ctx.db.patch(import_id, totals);
  },
});

/**
 * Removes an import and every work order it created. Used to clean up when a
 * batched upload fails part-way, so a half-written import is never left behind.
 */
export const deleteImport = mutation({
  args: {
    import_id: v.id("imports"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const rows = await ctx.db
      .query("workorders")
      .withIndex("by_import_id", (q) => q.eq("import_id", args.import_id))
      .take(500);

    for (const row of rows) {
      await ctx.db.delete(row._id);
    }

    // Only drop the import row once its work orders are all gone; the client
    // calls this repeatedly until `remaining` comes back zero.
    if (rows.length === 0) {
      await ctx.db.delete(args.import_id);
    }

    return { remaining: rows.length };
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
