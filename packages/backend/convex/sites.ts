import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { type QueryCtx, mutation, query } from "./_generated/server";

const siteRowValidator = v.object({
  area: v.string(),
  site: v.string(),
  panel_id: v.string(),
  quantity: v.optional(v.number()),
  size: v.optional(v.string()),
  area_progress: v.optional(v.string()),
  install_notes: v.optional(v.string()),
  equipment_needed: v.array(v.string()),
  location: v.optional(v.string()),
  missing_value: v.boolean(),
});

type SiteRow = typeof siteRowValidator.type;

function publicFields(site: Doc<"sites">) {
  return {
    _id: site._id,
    area: site.area,
    site: site.site,
    panel_id: site.panel_id,
    quantity: site.quantity,
    size: site.size,
    area_progress: site.area_progress,
    install_notes: site.install_notes,
    equipment_needed: site.equipment_needed,
    location: site.location,
    photo_saved: site.photo_saved,
    map_saved: site.map_saved,
    missing_value: site.missing_value,
  };
}

/**
 * Finds the existing document a row should update. Rows whose panel_id is a
 * placeholder ("???") are matched on panel_id *and* site, because different
 * sites share that placeholder and must not collapse into one row.
 */
function findExisting(ctx: QueryCtx, row: SiteRow) {
  if (row.missing_value) {
    return ctx.db
      .query("sites")
      .withIndex("by_panel_id_site", (q) => q.eq("panel_id", row.panel_id).eq("site", row.site))
      .first();
  }
  return ctx.db
    .query("sites")
    .withIndex("by_panel_id", (q) => q.eq("panel_id", row.panel_id))
    .first();
}

export const listSites = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }
    const sites = await ctx.db.query("sites").order("desc").collect();
    return sites.map(publicFields);
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
      await Promise.all(site.site_img.map((storageId) => ctx.storage.getUrl(storageId)))
    ).filter((url): url is string => url !== null);

    return { ...publicFields(site), imageUrls };
  },
});

/**
 * Applies an uploaded Site Database. Rows already present are matched and
 * updated column by column; new panel ids are inserted.
 *
 * `photo_saved` and `map_saved` are never read from the file — they are derived
 * from whether the site has stored images and GPS coordinates respectively.
 */
export const upsertSites = mutation({
  args: {
    rows: v.array(siteRowValidator),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const existingDocs = await Promise.all(args.rows.map((row) => findExisting(ctx, row)));

    let inserted = 0;
    let updated = 0;

    for (let i = 0; i < args.rows.length; i++) {
      const row = args.rows[i];
      const existing = existingDocs[i];
      const map_saved = (row.location ?? "") !== "";

      if (existing) {
        await ctx.db.patch(existing._id, {
          ...row,
          map_saved,
          photo_saved: existing.site_img.length > 0,
        });
        updated++;
      } else {
        await ctx.db.insert("sites", {
          ...row,
          site_img: [],
          map_saved,
          photo_saved: false,
        });
        inserted++;
      }
    }

    return { inserted, updated };
  },
});
