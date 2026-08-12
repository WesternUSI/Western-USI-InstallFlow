import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx, mutation, query } from "./_generated/server";
import { findSiteForPanelSplit } from "./panelIds";

async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("Not authenticated");
  }
}

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

/**
 * How complete a site's admin-entered details are. The four fields below are
 * the ones the Edit Site Details screen fills in — everything else on a site
 * comes from the spreadsheet and is always present.
 */
export type SiteDetailStatus = "completed" | "incomplete" | "missing";

export const siteDetailStatusValidator = v.union(
  v.literal("completed"),
  v.literal("incomplete"),
  v.literal("missing"),
);

export function deriveDetailStatus(site: Doc<"sites">): SiteDetailStatus {
  const filled = [
    site.site_img.length > 0,
    (site.location ?? "").trim() !== "",
    (site.install_notes ?? "").trim() !== "",
    site.equipment_needed.length > 0,
  ].filter(Boolean).length;

  if (filled === 0) return "missing";
  if (filled === 4) return "completed";
  return "incomplete";
}

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
    additional_notes: site.additional_notes,
    photo_saved: site.photo_saved,
    map_saved: site.map_saved,
    missing_value: site.missing_value,
    detail_status: deriveDetailStatus(site),
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
    await requireIdentity(ctx);

    const sites = await ctx.db.query("sites").order("desc").collect();
    return sites.map(publicFields);
  },
});

export const getSite = query({
  args: {
    id: v.id("sites"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

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

function matchesSearch(site: Doc<"sites">, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (needle === "") return true;

  return [site.area, site.site, site.panel_id, site.size, site.area_progress].some(
    (field) => field !== undefined && field.toLowerCase().includes(needle),
  );
}

/** The four headline numbers above the Manage Site Data table. */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);

    const all = await ctx.db.query("sites").collect();
    const counts = { total: 0, completed: 0, incomplete: 0, missing: 0 };

    for (const site of all) {
      counts.total++;
      counts[deriveDetailStatus(site)]++;
    }

    return counts;
  },
});

/** Distinct areas, for the Location filter dropdown. */
export const areas = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);

    const all = await ctx.db.query("sites").collect();
    return [...new Set(all.map((site) => site.area).filter((area) => area !== ""))].sort();
  },
});

/**
 * One page of sites plus the per-status counts that drive the tab bar. Counts
 * reflect the search and location filters but ignore the selected tab.
 */
export const list = query({
  args: {
    status: v.optional(siteDetailStatusValidator),
    area: v.optional(v.string()),
    search: v.optional(v.string()),
    page: v.optional(v.number()),
    page_size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const page = Math.max(1, args.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, args.page_size ?? 25));

    const all = await ctx.db.query("sites").collect();
    const scoped = all.filter(
      (site) =>
        matchesSearch(site, args.search ?? "") &&
        (args.area === undefined || site.area === args.area),
    );

    const counts = { all: 0, completed: 0, incomplete: 0, missing: 0 };
    for (const site of scoped) {
      counts.all++;
      counts[deriveDetailStatus(site)]++;
    }

    const filtered =
      args.status === undefined
        ? scoped
        : scoped.filter((site) => deriveDetailStatus(site) === args.status);

    filtered.sort((a, b) => a.area.localeCompare(b.area) || a.site.localeCompare(b.site));

    const start = (page - 1) * pageSize;
    return {
      rows: filtered.slice(start, start + pageSize).map(publicFields),
      total: filtered.length,
      page,
      page_size: pageSize,
      counts,
    };
  },
});

/** Saves the Edit Site Details form. Import-sourced columns are not touched. */
export const update = mutation({
  args: {
    id: v.id("sites"),
    location: v.optional(v.string()),
    install_notes: v.optional(v.string()),
    equipment_needed: v.array(v.string()),
    quantity: v.optional(v.number()),
    size: v.optional(v.string()),
    additional_notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const site = await ctx.db.get(args.id);
    if (site === null) {
      throw new Error("Site not found");
    }

    const { id, ...fields } = args;
    await ctx.db.patch(id, {
      ...fields,
      // Kept in step with the data rather than set by hand, exactly as during import.
      map_saved: (fields.location ?? "").trim() !== "",
    });
  },
});

/** Step 1 of an image upload: a short-lived URL the browser POSTs the file to. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Step 2 of an image upload: attach the stored file to the site. The design
 * shows a single site image, so this replaces whatever was there before and
 * deletes the old file.
 */
export const setSiteImage = mutation({
  args: {
    id: v.id("sites"),
    storage_id: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const site = await ctx.db.get(args.id);
    if (site === null) {
      throw new Error("Site not found");
    }

    for (const previous of site.site_img) {
      await ctx.storage.delete(previous);
    }

    await ctx.db.patch(args.id, { site_img: [args.storage_id], photo_saved: true });
  },
});

export const removeSiteImage = mutation({
  args: {
    id: v.id("sites"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const site = await ctx.db.get(args.id);
    if (site === null) {
      throw new Error("Site not found");
    }

    for (const previous of site.site_img) {
      await ctx.storage.delete(previous);
    }

    await ctx.db.patch(args.id, { site_img: [], photo_saved: false });
  },
});

/**
 * Resolves parsed work order panel splits to sites without writing anything,
 * so the import screen can preview which rows will fail to match. Uses the same
 * two-pass lookup as the import itself.
 */
export const resolveByPanelSplits = query({
  args: {
    panel_splits: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const unique = [...new Set(args.panel_splits)];
    const matches = await Promise.all(
      unique.map(async (panelSplit) => {
        const site = await findSiteForPanelSplit(ctx, panelSplit);
        return [
          panelSplit,
          site === null ? null : { site_id: site._id, train_line: site.area_progress },
        ] as const;
      }),
    );

    return Object.fromEntries(matches);
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
    file_name: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();

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

    await ctx.db.insert("site_imports", {
      file_name: args.file_name,
      uploaded_at: Date.now(),
      uploaded_by_name: user?.name ?? identity.name ?? identity.email ?? "Unknown user",
      total_rows: args.rows.length,
      inserted,
      updated,
    });

    return { inserted, updated };
  },
});

/** The most recent Site Database upload, for the Manage Site Data summary card. */
export const latestImport = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);

    return await ctx.db.query("site_imports").withIndex("by_uploaded_at").order("desc").first();
  },
});
