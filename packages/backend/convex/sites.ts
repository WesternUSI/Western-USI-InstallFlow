import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx, mutation, query } from "./_generated/server";
import { type SiteDetailStatus, deriveSiteDetailStatus } from "./derive";
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
export type { SiteDetailStatus } from "./derive";

export const siteDetailStatusValidator = v.union(
  v.literal("completed"),
  v.literal("incomplete"),
  v.literal("missing"),
);

/** Prefers the stored key, falling back for rows written before it existed. */
export function deriveDetailStatus(site: Doc<"sites">): SiteDetailStatus {
  return (site.detail_key as SiteDetailStatus | undefined) ?? deriveSiteDetailStatus(site);
}

/** The index key that must be rewritten whenever a site row changes. */
function derivedKeys(site: {
  site_img: unknown[];
  location?: string;
  install_notes?: string;
  equipment_needed: string[];
}) {
  return {
    detail_key: deriveSiteDetailStatus(site),
  };
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
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const sites = await ctx.db.query("sites").collect();
    const sorted = sites.slice().sort((a, b) => {
      const areaCompare = a.area.localeCompare(b.area);
      return areaCompare !== 0 ? areaCompare : a.panel_id.localeCompare(b.panel_id);
    });

    return sorted.map(publicFields);
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

    // Paired with their storage id so the dialog can remove a single one.
    const images = (
      await Promise.all(
        site.site_img.map(async (storage_id) => ({
          storage_id,
          url: await ctx.storage.getUrl(storage_id),
        })),
      )
    ).filter((image): image is { storage_id: typeof image.storage_id; url: string } =>
      Boolean(image.url),
    );

    // `imageUrls` is what the native app reads; `images` carries the storage id
    // as well so the admin dialog can remove one picture at a time.
    return { ...publicFields(site), images, imageUrls: images.map((image) => image.url) };
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
 * One page of sites using Convex cursor pagination.
 *
 * A search term is matched across several fields in memory (see
 * `matchesSearch`) rather than through an index, so it can't be paginated the
 * normal way — all sites are fetched, filtered, and returned as a single done
 * page. Fine at this table's scale (sites are not expected to exceed the
 * low tens of thousands, comfortably inside one query's document-read limit).
 * Without a search term, filtering goes through `by_area` /
 * `by_detail_key_area` and cursor pagination works as normal.
 */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(siteDetailStatusValidator),
    area: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const term = args.search?.trim() ?? "";
    const { area, status } = args;

    if (term !== "") {
      const all = await ctx.db.query("sites").collect();
      const matches = all.filter(
        (site) =>
          matchesSearch(site, term) &&
          (status === undefined || deriveDetailStatus(site) === status) &&
          (area === undefined || site.area === area),
      );

      return { page: matches.map(publicFields), isDone: true, continueCursor: "" };
    }

    const stream = (() => {
      if (status !== undefined) {
        return ctx.db
          .query("sites")
          .withIndex("by_detail_key_area", (q) =>
            area === undefined
              ? q.eq("detail_key", status)
              : q.eq("detail_key", status).eq("area", area),
          );
      }
      if (area !== undefined) {
        return ctx.db.query("sites").withIndex("by_area", (q) => q.eq("area", area));
      }
      return ctx.db.query("sites");
    })();

    const result = await stream.order("desc").paginate(args.paginationOpts);
    return { ...result, page: result.page.map(publicFields) };
  },
});

/**
 * Distinct values the search box can suggest.
 *
 * Takes no arguments on purpose: Convex caches a query per argument set, so one
 * shared result is computed when the table changes and reused by everyone. The
 * browser then filters it as the user types, which costs the backend nothing
 * per keystroke.
 */
export const searchOptions = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);

    const all = await ctx.db.query("sites").collect();
    const seen = new Map<string, { value: string; kind: string }>();

    const add = (value: string | undefined, kind: string) => {
      const trimmed = value?.trim();
      if (!trimmed) return;
      const key = `${kind}:${trimmed.toLowerCase()}`;
      if (!seen.has(key)) seen.set(key, { value: trimmed, kind });
    };

    for (const site of all) {
      add(site.area, "Location");
      add(site.site, "Details");
      add(site.panel_id, "Panel ID");
    }

    return [...seen.values()];
  },
});

/**
 * Per-status totals for the tab bar and the row counter. Kept apart from `list`
 * because a cursor page cannot know totals, and this walks every matching row.
 */
export const counts = query({
  args: {
    area: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const term = args.search?.trim() ?? "";
    const { area } = args;

    // Same in-memory match as `list`, so the tab numbers can never disagree
    // with the rows shown.
    const all = await ctx.db.query("sites").collect();
    const rows = all.filter(
      (site) => (area === undefined || site.area === area) && matchesSearch(site, term),
    );

    const counts = { all: 0, completed: 0, incomplete: 0, missing: 0 };
    for (const site of rows) {
      counts.all++;
      counts[deriveDetailStatus(site)]++;
    }

    return counts;
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
    const updated = { ...site, ...fields };
    await ctx.db.patch(id, {
      ...fields,
      // Kept in step with the data rather than set by hand, exactly as during import.
      map_saved: (fields.location ?? "").trim() !== "",
      ...derivedKeys(updated),
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

/** Step 2 of an image upload: add the stored file to the site's gallery. */
export const addSiteImage = mutation({
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

    if (site.site_img.includes(args.storage_id)) {
      return;
    }

    const site_img = [...site.site_img, args.storage_id];
    await ctx.db.patch(args.id, {
      site_img,
      photo_saved: true,
      ...derivedKeys({ ...site, site_img }),
    });
  },
});

/** Drops one image from the gallery and deletes the stored file behind it. */
export const removeSiteImage = mutation({
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

    const site_img = site.site_img.filter((storageId) => storageId !== args.storage_id);
    if (site_img.length === site.site_img.length) {
      return;
    }

    await ctx.storage.delete(args.storage_id);
    await ctx.db.patch(args.id, {
      site_img,
      photo_saved: site_img.length > 0,
      ...derivedKeys({ ...site, site_img }),
    });
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
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const existingDocs = await Promise.all(args.rows.map((row) => findExisting(ctx, row)));

    let inserted = 0;
    let updated = 0;

    for (let i = 0; i < args.rows.length; i++) {
      const row = args.rows[i];
      const existing = existingDocs[i];
      const map_saved = (row.location ?? "") !== "";

      if (existing) {
        const merged = { ...existing, ...row };
        await ctx.db.patch(existing._id, {
          ...row,
          map_saved,
          photo_saved: existing.site_img.length > 0,
          ...derivedKeys(merged),
        });
        updated++;
      } else {
        const fresh = { ...row, site_img: [] };
        await ctx.db.insert("sites", {
          ...fresh,
          map_saved,
          photo_saved: false,
          ...derivedKeys(fresh),
        });
        inserted++;
      }
    }

    return { inserted, updated };
  },
});

/**
 * Records one completed Site Database upload. Called once after the last batch
 * of `upsertSites`, so a large file can be applied over several transactions
 * without producing several import rows.
 */
export const recordSiteImport = mutation({
  args: {
    file_name: v.string(),
    total_rows: v.number(),
    inserted: v.number(),
    updated: v.number(),
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

    await ctx.db.insert("site_imports", {
      ...args,
      uploaded_at: Date.now(),
      uploaded_by_name: user?.name ?? identity.name ?? identity.email ?? "Unknown user",
    });
  },
});

/** Whether any site exists at all — gates the work order import. */
export const hasSites = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);
    return (await ctx.db.query("sites").first()) !== null;
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
