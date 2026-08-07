import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const siteRowValidator = v.object({
  area: v.string(),
  site: v.string(),
  panel_id: v.string(),
  installation_notes: v.optional(v.string()),
  equipment: v.array(v.string()),
  panel_qty: v.optional(v.number()),
  panel_size: v.optional(v.string()),
  line: v.optional(v.string()),
  gps_coordinates: v.optional(v.string()),
  photo_saved: v.boolean(),
  map_saved: v.boolean(),
});

export const listSites = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const sites = await ctx.db.query("sites").collect();

    return sites.map((site) => ({
      _id: site._id,
      area: site.area,
      site: site.site,
      panel_id: site.panel_id,
      gps_coordinates: site.gps_coordinates,
      installation_notes: site.installation_notes,
      equipment: site.equipment,
      panel_qty: site.panel_qty,
      panel_size: site.panel_size,
      line: site.line,
    }));
  },
});

export const getSite = query({
  args: {
    id: v.id("sites"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const site = await ctx.db.get(args.id);
    if (!site) {
      return null;
    }

    const imageUrls = (
      await Promise.all(site.image_id.map((storageId) => ctx.storage.getUrl(storageId)))
    ).filter((url): url is string => url !== null);

    return {
      _id: site._id,
      area: site.area,
      site: site.site,
      panel_id: site.panel_id,
      gps_coordinates: site.gps_coordinates,
      installation_notes: site.installation_notes,
      equipment: site.equipment,
      panel_qty: site.panel_qty,
      panel_size: site.panel_size,
      line: site.line,
      imageUrls,
    };
  },
});

export const upsertSites = mutation({
  args: {
    rows: v.array(siteRowValidator),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const existingDocs = await Promise.all(
      args.rows.map((row) =>
        ctx.db
          .query("sites")
          .withIndex("by_panel_id", (q) => q.eq("panel_id", row.panel_id))
          .unique(),
      ),
    );

    let inserted = 0;
    let updated = 0;

    for (let i = 0; i < args.rows.length; i++) {
      const row = args.rows[i];
      const existing = existingDocs[i];

      if (existing) {
        await ctx.db.patch(existing._id, {
          area: row.area,
          site: row.site,
          panel_id: row.panel_id,
          installation_notes: row.installation_notes,
          equipment: row.equipment,
          panel_qty: row.panel_qty,
          panel_size: row.panel_size,
          line: row.line,
          gps_coordinates: row.gps_coordinates,
          photo_saved: row.photo_saved,
          map_saved: row.map_saved,
        });
        updated++;
      } else {
        await ctx.db.insert("sites", { ...row, image_id: [] });
        inserted++;
      }
    }

    return { inserted, updated };
  },
});
