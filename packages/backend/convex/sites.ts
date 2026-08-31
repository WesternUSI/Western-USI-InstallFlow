import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx, mutation, query } from "./_generated/server";
import {
  type SiteDetailStatus,
  deriveSiteDetailStatus,
  deriveWorkOrderStatus,
  matchesTerm,
} from "./derive";
import { requireAdmin } from "./permissions";
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
  return matchesTerm([site.area, site.site, site.panel_id, site.size, site.area_progress], search);
}

/**
 * Inclusive window behind the Duration filter.
 *
 * Sites are upserted rather than kept as history, so there is no upload date on
 * the row — `_creationTime` is when the site first entered the database, which
 * makes this "sites added in the last N days".
 */
function withinCreated(
  site: Doc<"sites">,
  sinceMs: number | undefined,
  untilMs: number | undefined,
): boolean {
  if (sinceMs !== undefined && site._creationTime < sinceMs) return false;
  if (untilMs !== undefined && site._creationTime > untilMs) return false;
  return true;
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
    /** Inclusive `_creationTime` bounds, in epoch ms. Drives the Duration filter. */
    since_ms: v.optional(v.number()),
    until_ms: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const term = args.search?.trim() ?? "";
    const { area, status, since_ms, until_ms } = args;
    const isDated = since_ms !== undefined || until_ms !== undefined;

    // A search term and the Duration window are both matched in memory, so they
    // share one path: collect, filter, then cut the page by offset. Filtering
    // *after* reading a cursor page would leave pages empty while matches sat
    // further down. The sites table is a fixed asset list of a few hundred rows,
    // comfortably inside one query's read budget.
    if (term !== "" || isDated) {
      const matches = (await ctx.db.query("sites").collect()).filter(
        (site) =>
          matchesSearch(site, term) &&
          withinCreated(site, since_ms, until_ms) &&
          (status === undefined || deriveDetailStatus(site) === status) &&
          (area === undefined || site.area === area),
      );

      // The cursor carries an offset into the matched set rather than a Convex
      // cursor, so the pager keeps working while search is in memory.
      const offset = Number(args.paginationOpts.cursor ?? "0") || 0;
      const page = matches.slice(offset, offset + args.paginationOpts.numItems);
      const nextOffset = offset + page.length;

      return {
        page: page.map(publicFields),
        isDone: nextOffset >= matches.length,
        continueCursor: String(nextOffset),
      };
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
      // No filter: still walk the `by_area` index (rather than the default
      // table order, which is insertion time) so the Location column comes
      // out A-Z the same way a scoped-area query would.
      return ctx.db.query("sites").withIndex("by_area");
    })();

    const result = await stream.order("asc").paginate(args.paginationOpts);
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
    since_ms: v.optional(v.number()),
    until_ms: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const term = args.search?.trim() ?? "";
    const { area, since_ms, until_ms } = args;

    // Same in-memory match as `list`, so the tab numbers can never disagree
    // with the rows shown.
    const all = await ctx.db.query("sites").collect();
    const rows = all.filter(
      (site) =>
        (area === undefined || site.area === area) &&
        matchesSearch(site, term) &&
        withinCreated(site, since_ms, until_ms),
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
 * Creates one site by hand, for a panel that the uploaded sheet does not carry.
 *
 * Unlike `upsertSites` this refuses to overwrite: an existing panel id here is
 * a mistake rather than an update, and that row is already reachable from
 * Manage Site Data.
 */
export const addSite = mutation({
  args: {
    area: v.string(),
    site: v.string(),
    panel_id: v.string(),
    quantity: v.optional(v.number()),
    size: v.optional(v.string()),
    area_progress: v.optional(v.string()),
    install_notes: v.optional(v.string()),
    equipment_needed: v.array(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    // Same rule the parser applies: an id with no letters or digits ("???",
    // "-") is a placeholder rather than a real panel id.
    const missing_value = !/[a-z0-9]/i.test(args.panel_id);
    const row = { ...args, missing_value };

    const existing = await findExisting(ctx, row);
    if (existing !== null) {
      throw new Error(`Panel ID "${args.panel_id}" is already in the site database.`);
    }

    const fresh = { ...row, site_img: [] };
    const id = await ctx.db.insert("sites", {
      ...fresh,
      map_saved: (args.location ?? "") !== "",
      photo_saved: false,
      ...derivedKeys(fresh),
    });

    // A site that did not exist before can resolve schedule rows that were
    // imported with nothing to match.
    await ctx.scheduler.runAfter(0, internal.workorders.relinkMissingSites, {});

    return id;
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

    // Runs once the whole upload has landed rather than per batch: fresh site
    // data routinely resolves schedule rows imported before it.
    await ctx.scheduler.runAfter(0, internal.workorders.relinkMissingSites, {});
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

/**
 * Sites removed per transaction. Lower than the work-order batch because each
 * one also drops its images and re-points every work order that named it.
 */
const SITE_DELETE_BATCH = 50;

/**
 * Removes sites, and repairs what pointed at them.
 *
 * Two modes matching the table above it: `ids` for rows ticked by hand, or
 * `filter` for the header checkbox, where the browser never holds the ids and
 * the filter is re-evaluated here exactly as `list` and `counts` evaluate it.
 * `exclude` carries rows un-ticked out of a whole-filter selection.
 *
 * A work order whose site goes away is not deleted with it. It is unlinked and
 * flagged `missing_value`, which lands it back in Missing Sites — the same
 * state an import produces when a panel id matches nothing. Re-importing or
 * re-adding the site lets the existing relink sweep pick it up again, so no
 * completed work or photo is lost to a site being tidied away.
 */
export const deleteSites = mutation({
  args: {
    ids: v.optional(v.array(v.id("sites"))),
    filter: v.optional(
      v.object({
        status: v.optional(siteDetailStatusValidator),
        area: v.optional(v.string()),
        search: v.optional(v.string()),
        since_ms: v.optional(v.number()),
        until_ms: v.optional(v.number()),
        exclude: v.optional(v.array(v.id("sites"))),
      }),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ deleted: number; remaining: number; unlinked: number }> => {
    await requireAdmin(ctx);

    let doomed: Doc<"sites">[];
    let remaining = 0;

    if (args.ids !== undefined) {
      // Rows already gone read back as null rather than failing the batch, so a
      // retry is a no-op instead of an error.
      const found = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
      doomed = found.filter((row): row is Doc<"sites"> => row !== null);
    } else if (args.filter !== undefined) {
      const { area, status, since_ms, until_ms } = args.filter;
      const term = args.filter.search?.trim() ?? "";
      // Excluded up front, not skipped per batch: a row skipped inside the
      // batch would stay in `remaining` and the caller would loop forever.
      const spared = new Set<string>(args.filter.exclude ?? []);

      const matches = (await ctx.db.query("sites").collect()).filter(
        (site) =>
          !spared.has(site._id) &&
          matchesSearch(site, term) &&
          withinCreated(site, since_ms, until_ms) &&
          (status === undefined || deriveSiteDetailStatus(site) === status) &&
          (area === undefined || site.area === area),
      );

      doomed = matches.slice(0, SITE_DELETE_BATCH);
      remaining = matches.length - doomed.length;
    } else {
      throw new Error("Pass either ids or a filter");
    }

    let unlinked = 0;

    for (const site of doomed) {
      // Reference photos live in file storage, which no cascade reaches.
      for (const imageId of site.site_img) {
        // A file already gone is the state we were after; letting it throw
        // would roll back every deletion in the batch for no reason.
        try {
          await ctx.storage.delete(imageId);
        } catch {
          // Already deleted — nothing to do.
        }
      }

      const workOrders = await ctx.db
        .query("workorders")
        .withIndex("by_site_id", (q) => q.eq("site_id", site._id))
        .collect();

      for (const workOrder of workOrders) {
        const patch = {
          site_id: undefined,
          train_line: undefined,
          missing_value: true,
        };
        await ctx.db.patch(workOrder._id, {
          ...patch,
          status_key: deriveWorkOrderStatus({ ...workOrder, ...patch }),
        });
        unlinked++;
      }

      await ctx.db.delete(site._id);
    }

    return { deleted: doomed.length, remaining, unlinked };
  },
});
