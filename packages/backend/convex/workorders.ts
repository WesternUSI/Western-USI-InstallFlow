import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type QueryCtx, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { type WorkOrderStatus, deriveWorkOrderStatus, matchesTerm } from "./derive";
import { distanceFromEastPerthKm } from "./geo";
import { findSiteForPanelSplit } from "./panelIds";

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
 * Carries every column read off the Installation Schedule, so the admin
 * table can show the sheet back in full rather than a chosen subset.
 */
function toRow(workOrder: Doc<"workorders">) {
  return {
    _id: workOrder._id,
    status: deriveStatus(workOrder),
    contract_id: workOrder.contract_id,
    site: workOrder.site,
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
  };
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

function emptyCounts() {
  return { all: 0, completed: 0, allocated: 0, not_allocated: 0, missing_site: 0, pending: 0 };
}

async function requireIdentity(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("Not authenticated");
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

      return {
        page: page.map(toRow),
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
    return { ...result, page: result.page.map(toRow) };
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
    const byLine = new Map<string, { imported: number; allocated: number; completed: number }>();

    // SRS's "Train Line" maps to this field (schema comment: `// Line`) — the
    // raw per-row import value, not `train_line` (this codebase's own later
    // addition, snapshotting the matched site's *Area* instead).
    for (const workOrder of all) {
      const line = workOrder.area_progress ?? "Unassigned";
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
  args: { team: v.union(v.literal("Team 1"), v.literal("Team 2"), v.literal("Team 3"), v.literal("Team 4"), v.literal("Team 5")) },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const all = await ctx.db.query("workorders").collect();
    const byLine = new Map<string, { total: number; completed: number }>();

    for (const workOrder of all) {
      if (workOrder.assigned_team !== args.team) continue;

      const line = workOrder.area_progress ?? "Unassigned";
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
      contracted_panel_id: row.contracted_panel_id,
      advertiser_campaign: row.advertiser_campaign,
      panel_split: row.panel_split,
      panel_name: row.panel_name,
      site: sites[index]?.site ?? row.site,
      area_progress: row.area_progress,
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
      throw new Error("Work order not found");
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
      site: site?.site ?? rows[0].site,
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
      throw new Error("Not authenticated");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Marks every work order in `ids` (one card's merged panel-split rows)
 * completed with the same photo and notes, since they represent one physical
 * install photographed once. Rejects anything already completed rather than
 * silently overwriting an earlier completion's photo.
 */
export const completeWorkOrder = mutation({
  args: {
    ids: v.array(v.id("workorders")),
    photo: v.id("_storage"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const workOrders = await Promise.all(args.ids.map((id) => ctx.db.get(id)));

    for (const workOrder of workOrders) {
      if (workOrder !== null && workOrder.current_status === "completed") {
        throw new Error(`${workOrder.contracted_panel_id} is already completed`);
      }
    }

    const completed_at = Date.now();
    for (const workOrder of workOrders) {
      if (workOrder === null) continue;

      const patch = {
        current_status: "completed" as const,
        completion_photo: args.photo,
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
    const photoUrl =
      workOrder.completion_photo !== undefined
        ? await ctx.storage.getUrl(workOrder.completion_photo)
        : null;

    const users = await ctx.db.query("users").collect();
    const recipients = users.filter((user) => user.role === "admin").map((user) => user.email);

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
      site: site?.site ?? workOrder.site, // SRS "Location"
      completion_notes: workOrder.completion_notes,
      photoUrl,
      recipients,
    };
  },
});

const teamValidator = v.union(
  v.literal("Team 1"),
  v.literal("Team 2"),
  v.literal("Team 3"),
  v.literal("Team 4"),
  v.literal("Team 5"),
);

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
      throw new Error("Not authenticated");
    }

    const workOrders = await Promise.all(args.ids.map((id) => ctx.db.get(id)));

    for (const workOrder of workOrders) {
      if (
        workOrder !== null &&
        workOrder.assigned_team !== undefined &&
        workOrder.assigned_team !== args.team
      ) {
        throw new Error(
          `${workOrder.contracted_panel_id} is already assigned to ${workOrder.assigned_team}`,
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
 * for Complete Installs. Scoped to the same "most recent upload" window as
 * `listActiveWorkOrders`, and further filtered to `team` — Complete Installs
 * shows only the caller's primary team's work, same as Equipment Needed.
 */
export const listAllocatedWorkOrders = query({
  args: { team: teamValidator },
  handler: async (ctx, args) => {
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
      site: sites[index]?.site ?? row.site,
      area_progress: row.area_progress,
      train_line: row.train_line,
      priority: row.priority,
      missing_value: row.missing_value,
      size: row.size,
      assigned_team: row.assigned_team,
      // SRS FR-CI-6: Complete Installs orders by distance from East Perth.
      distance_km: distanceFromEastPerthKm(sites[index]?.location),
    }));
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
 * The `train_line` arg is named for the value it carries (whatever
 * `byAreaForTeam` labelled the row with) rather than the schema field it's
 * matched against — see that query's comment for why it reads `area_progress`.
 */
export const listWorkOrdersForArea = query({
  args: { train_line: v.string(), team: teamValidator },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const all = await ctx.db.query("workorders").collect();
    const rows = all.filter((row) => {
      if ((row.area_progress ?? "Unassigned") !== args.train_line) return false;
      if (row.assigned_team !== args.team) return false;
      const status = deriveStatus(row);
      return status === "completed" || status === "allocated";
    });

    const sites = await Promise.all(
      rows.map((row) => (row.site_id ? ctx.db.get(row.site_id) : null)),
    );

    return rows
      .map((row, index) => ({
        _id: row._id,
        contracted_panel_id: row.contracted_panel_id,
        advertiser_campaign: row.advertiser_campaign,
        panel_split: row.panel_split,
        panel_name: row.panel_name,
        site: sites[index]?.site ?? row.site,
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
      throw new Error("Not authenticated");
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
