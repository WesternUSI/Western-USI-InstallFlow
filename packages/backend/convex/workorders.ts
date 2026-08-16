import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type QueryCtx, mutation, query } from "./_generated/server";
import { type WorkOrderStatus, deriveWorkOrderStatus, matchesTerm } from "./derive";

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

function toRow(workOrder: Doc<"workorders">) {
  return {
    _id: workOrder._id,
    status: deriveStatus(workOrder),
    site: workOrder.site,
    panel_split: workOrder.panel_split,
    contracted_panel_id: workOrder.contracted_panel_id,
    advertiser_campaign: workOrder.advertiser_campaign,
    existing_advertiser: workOrder.existing_advertiser,
    train_line: workOrder.train_line,
    panel_name: workOrder.panel_name,
    proposed_install_date: workOrder.proposed_install_date,
    end_date: workOrder.end_date,
    schedule: workOrder.schedule,
    assigned_team: workOrder.assigned_team,
    priority: workOrder.priority,
    upload_date: workOrder.upload_date,
  };
}

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

    for (const workOrder of all) {
      const line = workOrder.train_line ?? "Unassigned";
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
      priority: row.priority,
      missing_value: row.missing_value,
      size: row.size,
      assigned_team: row.assigned_team,
    }));
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
 * Adds `team` to each work order's `assigned_team` set and recomputes
 * `status_key` alongside it, since allocation status is derived from
 * `assigned_team` (see convex/derive.ts) and the status index reads the
 * stored key rather than computing it live.
 */
export const allocateWorkOrders = mutation({
  args: { ids: v.array(v.id("workorders")), team: teamValidator },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    for (const id of args.ids) {
      const workOrder = await ctx.db.get(id);
      if (workOrder === null) continue;

      const assigned_team = workOrder.assigned_team.includes(args.team)
        ? workOrder.assigned_team
        : [...workOrder.assigned_team, args.team];

      await ctx.db.patch(id, {
        assigned_team,
        status_key: deriveWorkOrderStatus({ ...workOrder, assigned_team }),
      });
    }
  },
});

/** Removes `team` from each work order's `assigned_team` set. */
export const unallocateWorkOrders = mutation({
  args: { ids: v.array(v.id("workorders")), team: teamValidator },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    for (const id of args.ids) {
      const workOrder = await ctx.db.get(id);
      if (workOrder === null) continue;

      const assigned_team = workOrder.assigned_team.filter((t) => t !== args.team);

      await ctx.db.patch(id, {
        assigned_team,
        status_key: deriveWorkOrderStatus({ ...workOrder, assigned_team }),
      });
    }
  },
});
