import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type QueryCtx,
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { type WorkOrderStatus, deriveWorkOrderStatus, matchesTerm } from "./derive";
import { enabledRecipientEmails } from "./emails";
import { EAST_PERTH_LAT, EAST_PERTH_LNG, distanceFromEastPerthKm, parseCoordinates } from "./geo";
import { findSiteForPanelSplit } from "./panelIds";
import { requireAdmin } from "./permissions";

export type { WorkOrderStatus } from "./derive";

export const workOrderStatusValidator = v.union(
  v.literal("completed"),
  v.literal("missing_site"),
  v.literal("pending"),
  v.literal("allocated"),
  v.literal("not_allocated"),
);

/** Prefers the stored key, falling back for rows written before it existed. */
export function deriveStatus(workOrder: Doc<"workorders">): WorkOrderStatus {
  return (workOrder.status_key as WorkOrderStatus | undefined) ?? deriveWorkOrderStatus(workOrder);
}

/**
 * A work order's Area, resolved from the Site Database row its Panel ID
 * matched — not the raw "Line" column on the imported schedule row, which is
 * blank on most rows. Prefers the live site value, then the import-time
 * snapshot (`train_line`), then the raw column. Panel ID is the source of
 * truth for Area, the same way `site` (Location) is resolved through `site_id`.
 */
function resolveArea(
  workOrder: Doc<"workorders">,
  site: Doc<"sites"> | null | undefined,
): string | undefined {
  for (const value of [site?.area_progress, workOrder.train_line, workOrder.area_progress]) {
    if (value !== undefined && value.trim() !== "") return value;
  }
  return undefined;
}

/** `resolveArea` with the "Unassigned" fallback the grouping screens apply. */
function areaLabel(workOrder: Doc<"workorders">, site: Doc<"sites"> | null | undefined): string {
  return resolveArea(workOrder, site)?.trim() || "Unassigned";
}

/**
 * Every site keyed by id, for the aggregate Area queries that don't already
 * hold the matched row. The sites table is a fixed asset list of a few
 * hundred rows (see `sites.list`), so one collect is cheap.
 */
async function sitesById(ctx: QueryCtx): Promise<Map<Id<"sites">, Doc<"sites">>> {
  const all = await ctx.db.query("sites").collect();
  return new Map(all.map((site) => [site._id, site]));
}

/**
 * Carries every column read off the Installation Schedule, so the admin
 * table can show the sheet back in full rather than a chosen subset.
 *
 * `site` (displayed as "Location") is resolved through `site_id` into the
 * Site Database's own `area` field — the sheet's actual LOCATION column —
 * rather than trusting the raw text on the work order row, which is blank
 * on most rows. Falls back to that raw text when no site matched.
 *
 * `completion_photo_urls` are resolved from the stored files the installer
 * submitted in Complete Installs — the same photos the completion email
 * carries — so the admin table can show them too, not just email them out.
 */
function toRow(
  workOrder: Doc<"workorders">,
  site: Doc<"sites"> | null,
  completionPhotoUrls: string[],
) {
  return {
    _id: workOrder._id,
    status: deriveStatus(workOrder),
    contract_id: workOrder.contract_id,
    site: site?.area ?? workOrder.site,
    panel_split: workOrder.panel_split,
    contracted_panel_id: workOrder.contracted_panel_id,
    advertiser_campaign: workOrder.advertiser_campaign,
    existing_advertiser: workOrder.existing_advertiser,
    train_line: workOrder.train_line,
    panel_name: workOrder.panel_name,
    quantity: workOrder.quantity,
    format: workOrder.format,
    size: workOrder.size,
    comments: workOrder.comments,
    area_progress: workOrder.area_progress,
    proposed_install_date: workOrder.proposed_install_date,
    end_date: workOrder.end_date,
    schedule: workOrder.schedule,
    assigned_team: workOrder.assigned_team,
    priority: workOrder.priority,
    upload_date: workOrder.upload_date,
    completion_photo_urls: completionPhotoUrls,
  };
}

/**
 * Every completion photo storage id for one row. Reads the multi-photo
 * `completion_photos`, falling back to the original single `completion_photo`
 * for rows completed before multi-photo existed.
 */
function completionPhotoIds(workOrder: Doc<"workorders">): Id<"_storage">[] {
  if (workOrder.completion_photos !== undefined) return workOrder.completion_photos;
  return workOrder.completion_photo !== undefined ? [workOrder.completion_photo] : [];
}

/** Storage-resolved completion photo URLs for one row, empty if it has none. */
async function resolveCompletionPhotoUrls(
  ctx: QueryCtx,
  workOrder: Doc<"workorders">,
): Promise<string[]> {
  const urls = await Promise.all(
    completionPhotoIds(workOrder).map((id) => ctx.storage.getUrl(id)),
  );
  return urls.filter((url): url is string => url !== null);
}

/** Work orders re-checked per transaction — see `relinkMissingSites`. */
const RELINK_BATCH_SIZE = 200;

/**
 * Re-resolves work orders left flagged as missing a site.
 *
 * A schedule row is flagged at import time when its panel id matched nothing
 * in the Site Database. Uploading more site data — or adding a site by hand —
 * can make those matches possible after the fact, so this sweeps the flagged
 * rows and links whichever now resolve. Rows that still match nothing are
 * left alone.
 *
 * Batched and self-rescheduling: one mutation is a single transaction with a
 * bounded write budget, and a backlog can run to thousands of rows. Patching a
 * row changes its `status_key`, which drops it out of the index being walked —
 * the cursor is positional, so the rows still to visit keep their places.
 */
export const relinkMissingSites = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ linked: number }> => {
    const page = await ctx.db
      .query("workorders")
      .withIndex("by_status_key", (q) => q.eq("status_key", "missing_site"))
      .paginate({ numItems: RELINK_BATCH_SIZE, cursor: args.cursor ?? null });

    let linked = 0;
    for (const workOrder of page.page) {
      const site = await findSiteForPanelSplit(ctx, workOrder.panel_split);
      if (site === null) continue;

      const patch = {
        site_id: site._id,
        train_line: site.area_progress,
        missing_value: false,
      };
      await ctx.db.patch(workOrder._id, {
        ...patch,
        status_key: deriveWorkOrderStatus({ ...workOrder, ...patch }),
      });
      linked++;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.workorders.relinkMissingSites, {
        cursor: page.continueCursor,
      });
    }

    return { linked };
  },
});

/** Completed rows swept per transaction — see `archiveSupersededOrders`. */
const ARCHIVE_BATCH_SIZE = 200;

/**
 * Archives completed work orders left behind by an earlier import.
 *
 * Every upload inserts a fresh set of rows and keeps the previous ones, so
 * without this the app's per-area counts accumulate every install ever done and
 * "completed" never returns to zero on a new schedule. Archiving hides those
 * rows from the app; the admin panel keeps showing them, because the history is
 * the record.
 *
 * Only completed rows are touched. An older row that is still outstanding is
 * unfinished work and has to stay visible.
 *
 * Keyed on `import_id` rather than `upload_date` so two imports on the same day
 * behave the way two imports on different days do.
 *
 * Batched and self-rescheduling, like `relinkMissingSites`. Archiving moves
 * `current_status` and leaves `status_key` on "completed", so a patched row
 * keeps its place in the index being walked and the cursor stays valid;
 * already-archived rows are skipped, so a re-run is a no-op.
 */
export const archiveSupersededOrders = internalMutation({
  args: { keep_import_id: v.id("imports"), cursor: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ archived: number }> => {
    const page = await ctx.db
      .query("workorders")
      .withIndex("by_status_key", (q) => q.eq("status_key", "completed"))
      .paginate({ numItems: ARCHIVE_BATCH_SIZE, cursor: args.cursor ?? null });

    let archived = 0;
    for (const workOrder of page.page) {
      if (workOrder.current_status === "archived") continue;
      if (workOrder.import_id === args.keep_import_id) continue;

      // `status_key` deliberately stays "completed" — see `deriveWorkOrderStatus`.
      await ctx.db.patch(workOrder._id, { current_status: "archived" });
      archived++;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.workorders.archiveSupersededOrders, {
        keep_import_id: args.keep_import_id,
        cursor: page.continueCursor,
      });
    }

    return { archived };
  },
});

function emptyCounts() {
  return { all: 0, completed: 0, allocated: 0, not_allocated: 0, missing_site: 0, pending: 0 };
}

async function requireIdentity(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError("Your session has expired. Sign in again and retry.");
  }
}

function fetchAll(ctx: QueryCtx, importId: Id<"imports"> | undefined) {
  if (importId === undefined) {
    return ctx.db.query("workorders").collect();
  }
  return ctx.db
    .query("workorders")
    .withIndex("by_import_id", (q) => q.eq("import_id", importId))
    .collect();
}

/** Inclusive `upload_date` window behind the Duration filter. */
function withinRange(
  workOrder: Doc<"workorders">,
  since: string | undefined,
  until: string | undefined,
): boolean {
  if (since !== undefined && workOrder.upload_date < since) return false;
  if (until !== undefined && workOrder.upload_date > until) return false;
  return true;
}

/** Matches the free-text search box above the table. */
function matchesSearch(workOrder: Doc<"workorders">, search: string): boolean {
  return matchesTerm(
    [
      workOrder.site,
      workOrder.panel_split,
      workOrder.contracted_panel_id,
      workOrder.advertiser_campaign,
      workOrder.existing_advertiser,
      workOrder.panel_name,
      workOrder.train_line,
    ],
    search,
  );
}

/**
 * One page of work orders.
 *
 * Without a search term the status tab filters through an index and Convex
 * cursor pagination does the paging. With one, the term is matched in memory
 * across several columns (a Convex search index covers exactly one field), so
 * the page is cut from the matched set and the cursor carries an offset instead
 * — filtering *after* a cursor page is read cannot work, because a selective
 * term leaves page after page empty while the matches sit further down.
 */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    import_id: v.optional(v.id("imports")),
    status: v.optional(workOrderStatusValidator),
    search: v.optional(v.string()),
    /** Inclusive `upload_date` bounds as YYYY-MM-DD. Drives the Duration filter. */
    since: v.optional(v.string()),
    until: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const term = args.search?.trim() ?? "";
    const importId = args.import_id;
    const status = args.status;
    const { since, until } = args;

    if (term !== "") {
      const matches = (await fetchAll(ctx, importId)).filter(
        (workOrder) =>
          matchesSearch(workOrder, term) &&
          (status === undefined || deriveStatus(workOrder) === status) &&
          withinRange(workOrder, since, until),
      );

      const offset = Number(args.paginationOpts.cursor ?? "0") || 0;
      const page = matches.slice(offset, offset + args.paginationOpts.numItems);
      const nextOffset = offset + page.length;
      const sites = await Promise.all(
        page.map((workOrder) => (workOrder.site_id ? ctx.db.get(workOrder.site_id) : null)),
      );
      const photoUrls = await Promise.all(
        page.map((workOrder) => resolveCompletionPhotoUrls(ctx, workOrder)),
      );

      return {
        page: page.map((workOrder, index) => toRow(workOrder, sites[index], photoUrls[index])),
        isDone: nextOffset >= matches.length,
        continueCursor: String(nextOffset),
      };
    }

    const stream = (() => {
      if (importId !== undefined && status !== undefined) {
        return ctx.db
          .query("workorders")
          .withIndex("by_import_status", (q) =>
            q.eq("import_id", importId).eq("status_key", status),
          );
      }
      if (importId !== undefined) {
        return ctx.db
          .query("workorders")
          .withIndex("by_import_id", (q) => q.eq("import_id", importId));
      }
      // `upload_date` is a YYYY-MM-DD string, so a range on it is a plain
      // lexicographic comparison and stays inside the index.
      if (status !== undefined) {
        return ctx.db
          .query("workorders")
          .withIndex("by_status_upload", (q) => {
            const scoped = q.eq("status_key", status);
            if (since !== undefined && until !== undefined) {
              return scoped.gte("upload_date", since).lte("upload_date", until);
            }
            if (since !== undefined) return scoped.gte("upload_date", since);
            if (until !== undefined) return scoped.lte("upload_date", until);
            return scoped;
          });
      }
      if (since !== undefined || until !== undefined) {
        return ctx.db.query("workorders").withIndex("by_upload_date", (q) => {
          if (since !== undefined && until !== undefined) {
            return q.gte("upload_date", since).lte("upload_date", until);
          }
          return since !== undefined
            ? q.gte("upload_date", since)
            : q.lte("upload_date", until as string);
        });
      }
      return ctx.db.query("workorders");
    })();

    const result = await stream.order("desc").paginate(args.paginationOpts);
    const sites = await Promise.all(
      result.page.map((workOrder) => (workOrder.site_id ? ctx.db.get(workOrder.site_id) : null)),
    );
    const photoUrls = await Promise.all(
      result.page.map((workOrder) => resolveCompletionPhotoUrls(ctx, workOrder)),
    );
    return {
      ...result,
      page: result.page.map((workOrder, index) => toRow(workOrder, sites[index], photoUrls[index])),
    };
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

    const all = await ctx.db.query("workorders").collect();
    const seen = new Map<string, { value: string; kind: string }>();

    const add = (value: string | undefined, kind: string) => {
      const trimmed = value?.trim();
      if (!trimmed) return;
      const key = `${kind}:${trimmed.toLowerCase()}`;
      if (!seen.has(key)) seen.set(key, { value: trimmed, kind });
    };

    for (const workOrder of all) {
      add(workOrder.site, "Location");
      add(workOrder.panel_split, "Panel ID");
      add(workOrder.advertiser_campaign, "Advertiser");
      add(workOrder.existing_advertiser, "Existing Advertiser");
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
    import_id: v.optional(v.id("imports")),
    search: v.optional(v.string()),
    since: v.optional(v.string()),
    until: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    // Matched exactly the way `list` matches, so the tab numbers can never
    // disagree with the rows shown.
    const term = args.search?.trim() ?? "";
    const counts = emptyCounts();

    for (const workOrder of await fetchAll(ctx, args.import_id)) {
      if (!matchesSearch(workOrder, term)) continue;
      if (!withinRange(workOrder, args.since, args.until)) continue;
      counts.all++;
      counts[deriveStatus(workOrder)]++;
    }

    return counts;
  },
});

/** The four headline numbers on the dashboard. */
export const dashboardStats = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);

    const all = await ctx.db.query("workorders").collect();
    const counts = emptyCounts();
    for (const workOrder of all) {
      counts.all++;
      counts[deriveStatus(workOrder)]++;
    }

    return {
      imported: counts.not_allocated,
      allocated: counts.allocated,
      completed: counts.completed,
      pending: counts.pending,
      missing_sites: counts.missing_site,
      total: counts.all,
    };
  },
});

/** "Work Orders by Area" — one row per train line, with a completion percentage. */
export const byArea = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);

    const all = await ctx.db.query("workorders").collect();
    const sites = await sitesById(ctx);
    const byLine = new Map<string, { imported: number; allocated: number; completed: number }>();

    // Area comes from the Site Database row the work order's Panel ID matched
    // (see `resolveArea`), not the raw "Line" column, which is blank on most rows.
    for (const workOrder of all) {
      // Superseded by a later import. Counting these is what stopped
      // "completed" ever returning to zero on a fresh schedule.
      if (workOrder.current_status === "archived") continue;

      const line = areaLabel(workOrder, workOrder.site_id ? sites.get(workOrder.site_id) : null);
      const entry = byLine.get(line) ?? { imported: 0, allocated: 0, completed: 0 };

      entry.imported++;
      const status = deriveStatus(workOrder);
      if (status === "completed") {
        entry.completed++;
        entry.allocated++;
      } else if (status === "allocated") {
        entry.allocated++;
      }

      byLine.set(line, entry);
    }

    return [...byLine.entries()]
      .map(([train_line, entry]) => ({
        train_line,
        ...entry,
        progress: entry.imported === 0 ? 0 : Math.round((entry.completed / entry.imported) * 100),
      }))
      .sort((a, b) => a.train_line.localeCompare(b.train_line));
  },
});

/**
 * The Work Orders home screen's "Area Progress" widget — unlike `byArea`
 * (which reports every work order regardless of team, for Allocate/Complete
 * Installs), this is scoped to the caller's own primary team's allocated
 * workload: both the completed count and the total are of work orders
 * assigned to `team`, so it reads as "how much of *my* work in this area is
 * done." Single-team only — there's no more merged/additional-team concept.
 */
export const byAreaForTeam = query({
  args: { team: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const all = await ctx.db.query("workorders").collect();
    const sites = await sitesById(ctx);
    const byLine = new Map<string, { total: number; completed: number }>();

    for (const workOrder of all) {
      if (workOrder.assigned_team !== args.team) continue;
      // Superseded by a later import — see `byArea`.
      if (workOrder.current_status === "archived") continue;

      const line = areaLabel(workOrder, workOrder.site_id ? sites.get(workOrder.site_id) : null);
      const entry = byLine.get(line) ?? { total: 0, completed: 0 };
      entry.total++;
      if (deriveStatus(workOrder) === "completed") entry.completed++;
      byLine.set(line, entry);
    }

    return [...byLine.entries()]
      .map(([train_line, entry]) => ({ train_line, ...entry }))
      .sort((a, b) => a.train_line.localeCompare(b.train_line));
  },
});

/**
 * The active work order set for Browse Work Orders: every order not yet
 * completed, from any upload, newest upload first.
 *
 * Deliberately *not* scoped to the newest `upload_date`. It used to be, which
 * meant importing a single new row dropped every outstanding order from an
 * earlier batch out of the app while the admin panel still listed them.
 * Superseding old work is `archiveSupersededOrders`' job, and it only archives
 * rows that are already completed — so "archived" is the one thing that hides
 * an order here, which is also what `byArea` counts by.
 *
 * `site` is resolved through `site_id` into the Site Database's own `area`
 * field — the sheet's actual LOCATION column — rather than trusting the raw
 * LOCATION text stored on the work order row. Rows with no matched site (`site_id`
 * unset) fall back to that raw text.
 */
export const listActiveWorkOrders = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError("Your session has expired. Sign in again and retry.");
    }

    const rows = await ctx.db
      .query("workorders")
      .withIndex("by_upload_date")
      .order("desc")
      .collect();

    const active = rows.filter(
      (row) => row.current_status !== "completed" && row.current_status !== "archived",
    );
    const sites = await Promise.all(
      active.map((row) => (row.site_id ? ctx.db.get(row.site_id) : null)),
    );

    return active.map((row, index) => ({
      _id: row._id,
      contracted_panel_id: row.contracted_panel_id,
      advertiser_campaign: row.advertiser_campaign,
      panel_split: row.panel_split,
      panel_name: row.panel_name,
      site: sites[index]?.area ?? row.site,
      area_progress: resolveArea(row, sites[index]),
      train_line: row.train_line,
      priority: row.priority,
      missing_value: row.missing_value,
      size: row.size,
      assigned_team: row.assigned_team,
    }));
  },
});

/**
 * Merged detail for Install Detail — `ids` is a card's full `workOrderIds`
 * set (several panel-split rows sharing one `contracted_panel_id` show as one
 * install), so fields that can differ per row are joined into one label the
 * same way `groupWorkOrders.ts` merges cards for the list screens. Equipment
 * and installation notes live on the matched site, not the work order rows.
 */
export const getWorkOrderDetail = query({
  args: { ids: v.array(v.id("workorders")) },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const rows = (await Promise.all(args.ids.map((id) => ctx.db.get(id)))).filter(
      (row): row is Doc<"workorders"> => row !== null,
    );
    if (rows.length === 0) {
      throw new ConvexError("That work order no longer exists. Refresh and try again.");
    }

    const siteId = rows.find((row) => row.site_id !== undefined)?.site_id;
    const site = siteId !== undefined ? await ctx.db.get(siteId) : null;

    const joinUnique = (values: (string | undefined)[]) =>
      [...new Set(values.filter((value): value is string => !!value))].join(" & ");

    const images = (
      await Promise.all(
        (site?.site_img ?? []).map(async (storageId) => ({
          storage_id: storageId,
          url: await ctx.storage.getUrl(storageId),
        })),
      )
    ).filter((image): image is { storage_id: typeof image.storage_id; url: string } =>
      Boolean(image.url),
    );

    return {
      panel_name: joinUnique(rows.map((r) => r.panel_name)),
      site: site?.area ?? rows[0].site,
      panel_split: [...new Set(rows.map((r) => r.panel_split))]
        .sort((a, b) => a.localeCompare(b))
        .join(" & "),
      advertiser_campaign: joinUnique(rows.map((r) => r.advertiser_campaign)),
      existing_advertiser: joinUnique(rows.map((r) => r.existing_advertiser)),
      comments: joinUnique(rows.map((r) => r.comments)),
      quantity: rows.reduce((sum, r) => sum + (r.quantity ?? 0), 0),
      size: joinUnique(rows.map((r) => r.size)),
      priority: rows.some((r) => r.priority),
      assigned_team: joinUnique(rows.map((r) => r.assigned_team)),
      equipment_needed: site?.equipment_needed ?? [],
      install_notes: site?.install_notes,
      location: site?.location,
      images,
    };
  },
});

/** Storage upload URL for a completion photo — a plain passthrough to Convex file storage, same as `sites.generateUploadUrl`. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError("Your session has expired. Sign in again and retry.");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

/** Most completion photos one submission may carry — matches the app's picker cap. */
const MAX_COMPLETION_PHOTOS = 5;

/**
 * Marks every work order in `ids` (one card's merged panel-split rows)
 * completed with the same photos and notes, since they represent one physical
 * install photographed once. Rejects anything already completed rather than
 * silently overwriting an earlier completion's photos.
 */
export const completeWorkOrder = mutation({
  args: {
    ids: v.array(v.id("workorders")),
    // `photos` is what the multi-photo app sends. `photo` is the single-photo
    // arg the pre-2026-08-31 app build sends — kept optional so an installer
    // who hasn't updated can still complete installs against this backend.
    // Drop `photo` once that build is out of circulation.
    photos: v.optional(v.array(v.id("_storage"))),
    photo: v.optional(v.id("_storage")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError("Your session has expired. Sign in again and retry.");
    }

    const photos = args.photos ?? (args.photo !== undefined ? [args.photo] : []);
    if (photos.length === 0) {
      throw new ConvexError("Add at least one completion photo before submitting.");
    }
    if (photos.length > MAX_COMPLETION_PHOTOS) {
      throw new ConvexError(`You can attach at most ${MAX_COMPLETION_PHOTOS} completion photos.`);
    }

    const workOrders = await Promise.all(args.ids.map((id) => ctx.db.get(id)));

    for (const workOrder of workOrders) {
      if (
        workOrder !== null &&
        (workOrder.current_status === "completed" || workOrder.current_status === "archived")
      ) {
        throw new ConvexError(
          `${workOrder.contracted_panel_id} has already been completed. Refresh your work orders.`,
        );
      }
    }

    const completed_at = Date.now();
    for (const workOrder of workOrders) {
      if (workOrder === null) continue;

      const patch = {
        current_status: "completed" as const,
        completion_photos: photos,
        completion_notes: args.notes,
        completed_at,
      };
      await ctx.db.patch(workOrder._id, {
        ...patch,
        status_key: deriveWorkOrderStatus({ ...workOrder, ...patch }),
      });
      // SRS FR-CE-1: one completion email per work order, scheduled rather
      // than sent inline since a mutation can't make outbound HTTP calls.
      await ctx.scheduler.runAfter(0, internal.email.sendCompletionEmail, {
        workOrderId: workOrder._id,
      });
      // Surfaced in the admin panel's notification bell — installers complete
      // orders from the mobile app, so this is how the web side finds out.
      await ctx.db.insert("notifications", {
        type: "order_completed",
        title: "Order completed",
        body: `${workOrder.contract_id} — ${workOrder.advertiser_campaign} — ${workOrder.panel_split} — ${workOrder.site}`,
        work_order_id: workOrder._id,
        read: false,
      });
    }
  },
});

/**
 * Everything `email.sendCompletionEmail` (a "use node" action, which can't
 * touch the database directly) needs for one completion email. Recipients
 * are every user with the `admin` role (there can be more than one) — per
 * SRS NFR-M-3 ("Email recipients ... configurable without code changes"),
 * adding/removing one is a Users-screen change, not a deploy.
 */
export const getCompletionEmailData = internalQuery({
  args: { workOrderId: v.id("workorders") },
  handler: async (ctx, args) => {
    const workOrder = await ctx.db.get(args.workOrderId);
    if (workOrder === null) return null;

    const site = workOrder.site_id !== undefined ? await ctx.db.get(workOrder.site_id) : null;
    const photoUrls = await resolveCompletionPhotoUrls(ctx, workOrder);

    // Managed on the panel's Emails page. Admins are still the default there,
    // but they can be switched off or taken out, and other addresses added.
    const recipients = await enabledRecipientEmails(ctx);

    return {
      // The SRS reference doc's deviation note claims "Contract Number" maps
      // to `contracted_panel_id`, but real data contradicts that: `contract_id`
      // is the value shared across every panel on the same contract (e.g. every
      // "TABTouch AFL Finals" row has contract_id "1124"), while
      // `contracted_panel_id` varies per row and matches `panel_split` — a
      // panel identifier, not a contract number.
      contract_id: workOrder.contract_id, // SRS "Contract Number"
      advertiser_campaign: workOrder.advertiser_campaign,
      panel_split: workOrder.panel_split, // SRS "Panel ID"
      site: site?.area ?? workOrder.site, // SRS "Location"
      completion_notes: workOrder.completion_notes,
      photoUrls,
      recipients,
    };
  },
});

// Kept local rather than imported from "./teams" — that module imports from
// this one, so importing back would be circular. See the `teams` table
// comment in schema.ts for why this is a plain string, not a fixed union.
const teamValidator = v.string();

/**
 * Sets each work order's `assigned_team` to `team` and recomputes
 * `status_key` alongside it, since allocation status is derived from
 * `assigned_team` (see convex/derive.ts) and the status index reads the
 * stored key rather than computing it live.
 *
 * A work order can only ever have one team: if any id is already assigned to
 * a *different* team, the whole batch is rejected rather than silently
 * overwriting someone else's allocation.
 */
export const allocateWorkOrders = mutation({
  args: { ids: v.array(v.id("workorders")), team: teamValidator },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError("Your session has expired. Sign in again and retry.");
    }

    const workOrders = await Promise.all(args.ids.map((id) => ctx.db.get(id)));

    for (const workOrder of workOrders) {
      if (
        workOrder !== null &&
        workOrder.assigned_team !== undefined &&
        workOrder.assigned_team !== args.team
      ) {
        throw new ConvexError(
          `${workOrder.contracted_panel_id} is already assigned to ${workOrder.assigned_team}.`,
        );
      }
    }

    for (const workOrder of workOrders) {
      if (workOrder === null) continue;

      const assigned_team = args.team;
      await ctx.db.patch(workOrder._id, {
        assigned_team,
        status_key: deriveWorkOrderStatus({ ...workOrder, assigned_team }),
      });
    }
  },
});

/**
 * Consolidated equipment list for every allocated (not completed, not
 * pending, not missing-site) work order assigned to `team`. Each equipment
 * name appears once no matter how many matching work orders need it — two
 * work orders both needing a ladder still add just one "Ladder".
 */
export const equipmentNeeded = query({
  args: { team: teamValidator },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const workOrders = await ctx.db.query("workorders").collect();
    const siteIds = new Set<Id<"sites">>();

    for (const workOrder of workOrders) {
      if (
        workOrder.assigned_team === args.team &&
        workOrder.site_id !== undefined &&
        deriveStatus(workOrder) === "allocated"
      ) {
        siteIds.add(workOrder.site_id);
      }
    }

    const sites = await Promise.all([...siteIds].map((id) => ctx.db.get(id)));
    const equipment = new Set<string>();
    for (const site of sites) {
      if (site === null) continue;
      for (const item of site.equipment_needed) {
        const trimmed = item.trim();
        if (trimmed !== "") equipment.add(trimmed);
      }
    }

    return [...equipment].sort((a, b) => a.localeCompare(b));
  },
});

/**
 * The allocated (not completed, not pending, not missing-site) work order set
 * for Complete Installs. Covers every upload, on the same reasoning as
 * `listActiveWorkOrders`, and is further filtered to `team` — Complete Installs
 * shows only the caller's primary team's work, same as Equipment Needed.
 *
 * Archived rows need no explicit filter: `deriveWorkOrderStatus` reports them
 * as "completed", so they can never match "allocated".
 */
export const listAllocatedWorkOrders = query({
  args: { team: teamValidator },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError("Your session has expired. Sign in again and retry.");
    }

    const rows = await ctx.db
      .query("workorders")
      .withIndex("by_upload_date")
      .order("desc")
      .collect();

    const allocated = rows.filter(
      (row) => row.assigned_team === args.team && deriveStatus(row) === "allocated",
    );

    const sites = await Promise.all(
      allocated.map((row) => (row.site_id ? ctx.db.get(row.site_id) : null)),
    );

    return allocated.map((row, index) => ({
      _id: row._id,
      contracted_panel_id: row.contracted_panel_id,
      advertiser_campaign: row.advertiser_campaign,
      panel_split: row.panel_split,
      panel_name: row.panel_name,
      site: sites[index]?.area ?? row.site,
      area_progress: resolveArea(row, sites[index]),
      train_line: row.train_line,
      priority: row.priority,
      missing_value: row.missing_value,
      size: row.size,
      assigned_team: row.assigned_team,
      // SRS FR-CI-6: Complete Installs orders by distance from East Perth.
      distance_km: distanceFromEastPerthKm(sites[index]?.location),
      // For the per-card Navigate button — null when the site has no (or
      // unparseable) GPS coordinates.
      coordinates: sites[index]?.location ? parseCoordinates(sites[index].location) : null,
    }));
  },
});

/** Site GPS coordinates for a set of work orders, keyed by work order id — used by `optimizeRoute` to build the Routes API request. Null where the site has no (or unparseable) coordinates. */
export const getCoordinatesForWorkOrders = internalQuery({
  args: { workOrderIds: v.array(v.id("workorders")) },
  handler: async (ctx, args) => {
    const rows = await Promise.all(args.workOrderIds.map((id) => ctx.db.get(id)));
    const sites = await Promise.all(
      rows.map((row) => (row?.site_id ? ctx.db.get(row.site_id) : null)),
    );
    return args.workOrderIds.map((workOrderId, index) => ({
      workOrderId,
      coordinates: sites[index]?.location ? parseCoordinates(sites[index].location) : null,
    }));
  },
});

/**
 * Optimizes the visiting order for a set of allocated installs using the
 * Google Routes API's waypoint optimization: starts from the caller's live
 * GPS location (`origin`) and ends at the East Perth anchor used elsewhere
 * for distance sorting — Google's API always requires a fixed origin and
 * destination, so East Perth stands in as the trip's endpoint. Stops without
 * usable GPS coordinates can't be routed, so they're appended at the end in
 * their original order, same convention as the furthest-first sort.
 */
export const optimizeRoute = action({
  args: {
    origin: v.object({ lat: v.number(), lng: v.number() }),
    stops: v.array(v.object({ key: v.string(), workOrderId: v.id("workorders") })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError("Your session has expired. Sign in again and retry.");
    }

    if (args.stops.length === 0) return { order: [] };

    const coordinates = await ctx.runQuery(internal.workorders.getCoordinatesForWorkOrders, {
      workOrderIds: args.stops.map((s) => s.workOrderId),
    });
    const coordsByWorkOrderId = new Map(coordinates.map((c) => [c.workOrderId, c.coordinates]));

    const routable: { key: string; lat: number; lng: number }[] = [];
    const unroutable: string[] = [];
    for (const stop of args.stops) {
      const coords = coordsByWorkOrderId.get(stop.workOrderId);
      if (coords) {
        routable.push({ key: stop.key, lat: coords.lat, lng: coords.lng });
      } else {
        unroutable.push(stop.key);
      }
    }

    if (routable.length <= 1) {
      return { order: [...routable.map((r) => r.key), ...unroutable] };
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      throw new ConvexError("Route optimization isn't configured yet. Contact your admin.");
    }

    const toWaypoint = (lat: number, lng: number) => ({ location: { latLng: { latitude: lat, longitude: lng } } });

    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.optimizedIntermediateWaypointIndex",
      },
      body: JSON.stringify({
        origin: toWaypoint(args.origin.lat, args.origin.lng),
        destination: toWaypoint(EAST_PERTH_LAT, EAST_PERTH_LNG),
        intermediates: routable.map((r) => toWaypoint(r.lat, r.lng)),
        travelMode: "DRIVE",
        optimizeWaypointOrder: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Routes API error (${response.status}): ${errorText}`);
      throw new ConvexError("Couldn't reach the route optimizer. Try again shortly.");
    }

    const data = (await response.json()) as {
      routes?: { optimizedIntermediateWaypointIndex?: number[] }[];
    };
    const optimizedIndex = data.routes?.[0]?.optimizedIntermediateWaypointIndex;
    if (!optimizedIndex) {
      console.error(`Routes API returned no usable route: ${JSON.stringify(data)}`);
      throw new ConvexError("Couldn't reach the route optimizer. Try again shortly.");
    }

    const orderedKeys = optimizedIndex.map((i) => routable[i].key);
    return { order: [...orderedKeys, ...unroutable] };
  },
});

/**
 * Drill-down for one Area Progress row on the Work Orders home screen — every
 * one of the caller's primary team's allocated-or-completed work orders for
 * the tapped area (scoped the same way `byAreaForTeam`'s "x/y comp" count
 * is), each tagged with its status so the screen can render completed ones
 * read-only and let the rest go through Complete Installation. Not
 * restricted to the latest upload, since `byAreaForTeam` isn't either.
 *
 * The `train_line` arg carries whatever `byAreaForTeam` labelled the row with,
 * so it is matched back through the same `areaLabel` (Panel ID -> Site Database
 * Area), not against the raw schema field.
 */
export const listWorkOrdersForArea = query({
  args: { train_line: v.string(), team: teamValidator },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const all = await ctx.db.query("workorders").collect();
    const sitesMap = await sitesById(ctx);
    const rows = all.filter((row) => {
      // Superseded by a later import — this list sits behind the counts in
      // `byAreaForTeam`, so the two have to agree about what exists.
      if (row.current_status === "archived") return false;

      const site = row.site_id ? sitesMap.get(row.site_id) : null;
      if (areaLabel(row, site) !== args.train_line) return false;
      if (row.assigned_team !== args.team) return false;
      const status = deriveStatus(row);
      return status === "completed" || status === "allocated";
    });

    const sites = rows.map((row) => (row.site_id ? sitesMap.get(row.site_id) ?? null : null));

    return rows
      .map((row, index) => ({
        _id: row._id,
        contracted_panel_id: row.contracted_panel_id,
        advertiser_campaign: row.advertiser_campaign,
        panel_split: row.panel_split,
        panel_name: row.panel_name,
        site: sites[index]?.area ?? row.site,
        priority: row.priority,
        size: row.size,
        assigned_team: row.assigned_team,
        completed_at: row.completed_at,
        status: deriveStatus(row) as "completed" | "allocated",
      }))
      .sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0));
  },
});

/** Clears `assigned_team` on each work order currently assigned to `team`. */
export const unallocateWorkOrders = mutation({
  args: { ids: v.array(v.id("workorders")), team: teamValidator },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError("Your session has expired. Sign in again and retry.");
    }

    for (const id of args.ids) {
      const workOrder = await ctx.db.get(id);
      if (workOrder === null || workOrder.assigned_team !== args.team) continue;

      const assigned_team = undefined;
      await ctx.db.patch(id, {
        assigned_team,
        status_key: deriveWorkOrderStatus({ ...workOrder, assigned_team }),
      });
    }
  },
});

/**
 * Work orders removed per transaction. Matches `deleteImport`'s batch, which
 * has carried 500 deletes in one transaction since the rollback path shipped.
 */
const DELETE_BATCH_SIZE = 500;

/**
 * Removes work orders, plus what would otherwise be left dangling behind them.
 *
 * Two modes, because the table offers two ways to choose rows:
 *
 * - `ids` — rows ticked by hand. The caller chunks these, so one call is one
 *   transaction and `remaining` is always zero.
 * - `filter` — the header checkbox, where the browser never holds the ids. The
 *   filter is re-evaluated here exactly the way `list` and `counts` evaluate
 *   it, so what gets deleted is what the operator was shown a count of. One
 *   batch per call; the caller calls again until `remaining` is zero.
 *   `exclude` carries the rows un-ticked afterwards, which is the only part of
 *   that selection the browser does know.
 */
export const deleteWorkOrders = mutation({
  args: {
    ids: v.optional(v.array(v.id("workorders"))),
    filter: v.optional(
      v.object({
        status: v.optional(workOrderStatusValidator),
        search: v.optional(v.string()),
        since: v.optional(v.string()),
        until: v.optional(v.string()),
        /** Rows un-ticked out of an otherwise whole-filter selection. */
        exclude: v.optional(v.array(v.id("workorders"))),
      }),
    ),
  },
  handler: async (ctx, args): Promise<{ deleted: number; remaining: number }> => {
    await requireAdmin(ctx);

    let doomed: Doc<"workorders">[];
    let remaining = 0;

    if (args.ids !== undefined) {
      // Ids already deleted by a concurrent call read back as null rather than
      // failing the batch, so a retry is a no-op instead of an error.
      const found = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
      doomed = found.filter((row): row is Doc<"workorders"> => row !== null);
    } else if (args.filter !== undefined) {
      const { status, since, until } = args.filter;
      const term = args.filter.search?.trim() ?? "";

      // Excluded up front rather than skipped per batch: a row skipped inside
      // the batch would stay in `remaining` forever and the caller's loop
      // would never finish.
      const spared = new Set<string>(args.filter.exclude ?? []);

      const matches = (await fetchAll(ctx, undefined)).filter(
        (workOrder) =>
          !spared.has(workOrder._id) &&
          matchesSearch(workOrder, term) &&
          (status === undefined || deriveStatus(workOrder) === status) &&
          withinRange(workOrder, since, until),
      );

      doomed = matches.slice(0, DELETE_BATCH_SIZE);
      remaining = matches.length - doomed.length;
    } else {
      throw new Error("Pass either ids or a filter");
    }

    const touchedImports = new Set<Id<"imports">>();
    // Gathered rather than deleted in the row loop, because one set of photos
    // covers every panel completed in the same submission — `completeWorkOrder`
    // writes the same storage ids onto all of them. Deleting per row meant
    // deleting the same file twice, which threw and rolled the whole
    // transaction back.
    const photos = new Set<Id<"_storage">>();

    for (const workOrder of doomed) {
      for (const photo of completionPhotoIds(workOrder)) {
        photos.add(photo);
      }
      touchedImports.add(workOrder.import_id);
      await ctx.db.delete(workOrder._id);
    }

    // The photo lives in file storage, which no cascade reaches. Dropping only
    // the row would leave it stored, billed and unreachable forever.
    for (const photo of photos) {
      // A file already gone is the state we were after. Letting that throw
      // would undo the row deletions above for no reason.
      try {
        await ctx.storage.delete(photo);
      } catch {
        // Already deleted — nothing to do.
      }
    }

    // An import row holds the totals for its upload. Once its last work order
    // is gone those totals describe nothing, and the dashboard would go on
    // reporting them.
    for (const importId of touchedImports) {
      const survivor = await ctx.db
        .query("workorders")
        .withIndex("by_import_id", (q) => q.eq("import_id", importId))
        .first();

      if (survivor !== null) continue;

      // Same reasoning as the photos: an earlier partial run may already have
      // taken this row, and that is not a failure.
      try {
        await ctx.db.delete(importId);
      } catch {
        // Already deleted — nothing to do.
      }
    }

    return { deleted: doomed.length, remaining };
  },
});

/**
 * Turns a work order priority flag on or off by hand.
 *
 * Priority normally comes from a red fill in the uploaded schedule, but that
 * only works when the sheet says so: a theme colour cannot be read back, a
 * highlight gets missed, or the job simply becomes urgent after the upload.
 * Admin only, since it changes what the app tells installers to do first.
 *
 * Deliberately not folded into `status_key` — priority is orthogonal to the
 * status tabs, and mixing them would make a row leave its tab when flagged.
 */
export const setPriority = mutation({
  args: { id: v.id("workorders"), priority: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const workOrder = await ctx.db.get(args.id);
    if (workOrder === null) {
      throw new ConvexError("That work order no longer exists. Refresh and try again.");
    }

    await ctx.db.patch(args.id, { priority: args.priority });
  },
});
