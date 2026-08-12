import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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

/**
 * Strips a trailing bracketed sub-panel marker: "TJDP-ES (1L)" -> "TJDP-ES".
 * Ids without one, such as "PPCF26-27", are returned unchanged.
 */
function basePanelId(panelSplit: string): string {
  return panelSplit.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/**
 * Records one daily Installation Schedule upload.
 *
 * Every upload is kept as history: rows are always inserted, tagged with a
 * shared `upload_date`, and start at `pending` with no team assigned. Rows from
 * previous uploads are left untouched.
 *
 * `site_id` is resolved in two passes: first on the full `panel_split`, then —
 * for ids like "TJDP-ES (1L)" that name a sub-panel of a single site — on the
 * id with its bracketed suffix removed. Rows that match neither are flagged
 * with `missing_value`.
 */
export const insertWorkOrders = mutation({
  args: {
    rows: v.array(workOrderRowValidator),
    upload_date: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const findByPanelId = (panelId: string) =>
      ctx.db
        .query("sites")
        .withIndex("by_panel_id", (q) => q.eq("panel_id", panelId))
        .first();

    const exactMatches = await Promise.all(
      args.rows.map((row) => findByPanelId(row.panel_split)),
    );

    const sites = await Promise.all(
      args.rows.map(async (row, index) => {
        const exact = exactMatches[index];
        if (exact) return exact;

        const base = basePanelId(row.panel_split);
        return base === row.panel_split ? null : await findByPanelId(base);
      }),
    );

    let inserted = 0;
    let unlinked = 0;

    for (let i = 0; i < args.rows.length; i++) {
      const site = sites[i];
      if (!site) unlinked++;

      await ctx.db.insert("workorders", {
        ...args.rows[i],
        upload_date: args.upload_date,
        current_status: "pending",
        assigned_team: [],
        site_id: site?._id,
        missing_value: site === null,
      });
      inserted++;
    }

    return { inserted, unlinked };
  },
});

/**
 * The active work order set for Browse Work Orders: only the most recent
 * upload (uploads are permanent history, so older ones are superseded, not
 * deleted) and only orders not yet completed, newest-first.
 *
 * `site` is resolved through `site_id` into the sites table's own `site`
 * field — the authoritative name — rather than trusting the raw LOCATION
 * text stored on the work order row. Rows with no matched site (`site_id`
 * unset) fall back to that raw text.
 */
export const listActiveWorkOrders = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const latest = await ctx.db.query("workorders").withIndex("by_upload_date").order("desc").first();
    if (!latest) {
      return [];
    }

    const rows = await ctx.db
      .query("workorders")
      .withIndex("by_upload_date", (q) => q.eq("upload_date", latest.upload_date))
      .order("desc")
      .collect();

    const active = rows.filter((row) => row.current_status !== "completed");
    const sites = await Promise.all(
      active.map((row) => (row.site_id ? ctx.db.get(row.site_id) : null)),
    );

    return active.map((row, index) => ({
      _id: row._id,
      _creationTime: row._creationTime,
      contracted_panel_id: row.contracted_panel_id,
      advertiser_campaign: row.advertiser_campaign,
      panel_split: row.panel_split,
      panel_name: row.panel_name,
      site: sites[index]?.site ?? row.site,
      area_progress: row.area_progress,
      priority: row.priority,
      missing_value: row.missing_value,
    }));
  },
});
