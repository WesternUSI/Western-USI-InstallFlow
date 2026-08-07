import { v } from "convex/values";
import { mutation } from "./_generated/server";

const workOrderRowValidator = v.object({
  advertiser_campaign: v.string(),
  contracted_panel_id: v.string(),
  panel_split: v.optional(v.string()),
  location: v.string(),
  panel_name: v.string(),
  qty: v.optional(v.number()),
  format: v.optional(v.string()),
  size: v.optional(v.string()),
  proposed_install_date: v.optional(v.string()),
  end_date: v.optional(v.string()),
  comments: v.optional(v.string()),
  existing_advertiser: v.optional(v.string()),
  priority: v.boolean(),
});

export const upsertWorkOrders = mutation({
  args: {
    rows: v.array(workOrderRowValidator),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const uploadedAt = Date.now();

    const existingDocs = await Promise.all(
      args.rows.map((row) =>
        ctx.db
          .query("workorders")
          .withIndex("by_key", (q) =>
            q
              .eq("advertiser_campaign", row.advertiser_campaign)
              .eq("contracted_panel_id", row.contracted_panel_id)
              .eq("panel_split", row.panel_split),
          )
          .unique(),
      ),
    );

    const sites = await Promise.all(
      args.rows.map((row) =>
        ctx.db
          .query("sites")
          .withIndex("by_panel_id", (q) =>
            q.eq("panel_id", row.panel_split ?? row.contracted_panel_id),
          )
          .unique(),
      ),
    );

    let inserted = 0;
    let updated = 0;

    for (let i = 0; i < args.rows.length; i++) {
      const row = args.rows[i];
      const existing = existingDocs[i];
      const site = sites[i];

      const syncedFields = {
        advertiser_campaign: row.advertiser_campaign,
        contracted_panel_id: row.contracted_panel_id,
        panel_split: row.panel_split,
        location: row.location,
        panel_name: row.panel_name,
        qty: row.qty,
        format: row.format,
        size: row.size,
        proposed_install_date: row.proposed_install_date,
        end_date: row.end_date,
        comments: row.comments,
        existing_advertiser: row.existing_advertiser,
        site_id: site?._id,
        priority: row.priority,
        uploaded_at: uploadedAt,
      };

      if (existing) {
        // `completed` is deliberately excluded — it's worker-tracked
        // progress, not sourced from the file, and must survive re-uploads.
        await ctx.db.patch(existing._id, syncedFields);
        updated++;
      } else {
        await ctx.db.insert("workorders", { ...syncedFields, completed: false });
        inserted++;
      }
    }

    return { inserted, updated };
  },
});
