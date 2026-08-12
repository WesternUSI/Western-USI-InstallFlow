import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type QueryCtx, query } from "./_generated/server";

/**
 * The status shown in the admin UI. It is derived rather than stored, so
 * `current_status`, `assigned_team` and `missing_value` stay the single source
 * of truth and can never disagree with a cached label.
 */
export type WorkOrderStatus =
  | "completed"
  | "missing_site"
  | "pending"
  | "allocated"
  | "not_allocated";

export const workOrderStatusValidator = v.union(
  v.literal("completed"),
  v.literal("missing_site"),
  v.literal("pending"),
  v.literal("allocated"),
  v.literal("not_allocated"),
);

/**
 * Priority order matters: a completed install stays completed even if its site
 * never matched, and an unmatched row is flagged before allocation.
 */
export function deriveStatus(workOrder: Doc<"workorders">): WorkOrderStatus {
  if (workOrder.current_status === "completed") return "completed";
  if (workOrder.missing_value) return "missing_site";
  if (workOrder.current_status === "in_progress") return "pending";
  if (workOrder.assigned_team.length > 0) return "allocated";
  return "not_allocated";
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

/** Matches the free-text search box above the table. */
function matchesSearch(workOrder: Doc<"workorders">, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (needle === "") return true;

  return [
    workOrder.site,
    workOrder.panel_split,
    workOrder.contracted_panel_id,
    workOrder.advertiser_campaign,
    workOrder.existing_advertiser,
    workOrder.panel_name,
    workOrder.train_line,
  ].some((field) => field !== undefined && field.toLowerCase().includes(needle));
}

/**
 * One page of work orders plus the per-status counts that drive the tab bar.
 * Counts reflect the search term but ignore the selected status, so each tab
 * keeps showing how many rows the other tabs hold.
 */
export const list = query({
  args: {
    import_id: v.optional(v.id("imports")),
    status: v.optional(workOrderStatusValidator),
    search: v.optional(v.string()),
    page: v.optional(v.number()),
    page_size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const page = Math.max(1, args.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, args.page_size ?? 25));

    const all = await fetchAll(ctx, args.import_id);
    const searched = all.filter((workOrder) => matchesSearch(workOrder, args.search ?? ""));

    const counts = emptyCounts();
    for (const workOrder of searched) {
      counts.all++;
      counts[deriveStatus(workOrder)]++;
    }

    const filtered =
      args.status === undefined
        ? searched
        : searched.filter((workOrder) => deriveStatus(workOrder) === args.status);

    filtered.sort(
      (a, b) => a.site.localeCompare(b.site) || a.panel_split.localeCompare(b.panel_split),
    );

    const start = (page - 1) * pageSize;
    return {
      rows: filtered.slice(start, start + pageSize).map(toRow),
      total: filtered.length,
      page,
      page_size: pageSize,
      counts,
    };
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
