import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { type QueryCtx, mutation, query } from "./_generated/server";
import { matchesTerm } from "./derive";
import { deriveStatus, workOrderStatusValidator } from "./workorders";

/**
 * A team is referenced by name, not by id — see the `teams` table comment in
 * schema.ts. So anything that takes "a team" takes the name as a string, and
 * membership is not constrained at the validator level.
 */
export type Team = string;

export const teamValidator = v.string();

/** The three per-team numbers on the Teams screens. */
type TeamStatus = "allocated" | "completed" | "pending";

const TEAM_STATUSES: TeamStatus[] = ["allocated", "completed", "pending"];

async function requireIdentity(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("Not authenticated");
  }
}

function isTeamStatus(status: string): status is TeamStatus {
  return (TEAM_STATUSES as string[]).includes(status);
}

function toMember(user: Doc<"users">) {
  return {
    _id: user._id,
    clerk_id: user.clerk_id,
    name: user.name ?? user.email,
    email: user.email,
    role: user.role,
    team: user.team,
  };
}

/** Same shape as `workorders.toRow` — the team tabs reuse the shared table. */
function toOrderRow(workOrder: Doc<"workorders">) {
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
  };
}

/** Same columns the Manage Orders search box covers. */
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

/** Active teams, for every picker and filter. Archived ones are left out. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);

    const teams = await ctx.db.query("teams").collect();
    return teams
      .filter((team) => !team.archived)
      .map((team) => ({ _id: team._id, name: team.name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  },
});

/**
 * Creates a team. Names are the identity here, so they have to be unique —
 * including against archived teams, whose name still sits on historic rows.
 */
export const createTeam = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const name = args.name.trim();
    if (name === "") {
      throw new Error("Team name cannot be empty");
    }

    const existing = await ctx.db
      .query("teams")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (existing !== null) {
      throw new Error(`"${name}" already exists`);
    }

    return await ctx.db.insert("teams", { name, archived: false });
  },
});

/**
 * Hides a team without deleting it: its name still sits on completed work
 * orders, and those should keep reading correctly. Members have to be moved
 * out first — otherwise they would be stranded in a team nothing lists.
 */
export const archiveTeam = mutation({
  args: { id: v.id("teams") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const team = await ctx.db.get(args.id);
    if (team === null) {
      throw new Error("Team not found");
    }

    const users = await ctx.db.query("users").collect();
    const members = users.filter((user) => user.team === team.name).length;
    if (members > 0) {
      throw new Error(
        `${team.name} still has ${members} member${members === 1 ? "" : "s"} — move them to another team first.`,
      );
    }

    await ctx.db.patch(args.id, { archived: true });
  },
});

/**
 * One row per team for the Teams Management table, plus the headline totals.
 *
 * `assigned_team` has no index — allocation is written by the native app one
 * work order at a time — so this walks the table and tallies in memory, the
 * same way `workorders.counts` does.
 */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);

    const [workOrders, users, teams] = await Promise.all([
      ctx.db.query("workorders").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("teams").collect(),
    ]);

    const active = teams
      .filter((team) => !team.archived)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    const rows = active.map((team) => ({
      _id: team._id,
      team: team.name,
      allocated: 0,
      completed: 0,
      pending: 0,
      members: 0,
    }));
    const byTeam = new Map(rows.map((row) => [row.team, row]));

    const totals = { teams: rows.length, allocated: 0, completed: 0, pending: 0 };

    for (const workOrder of workOrders) {
      if (workOrder.assigned_team === undefined) continue;

      const status = deriveStatus(workOrder);
      if (!isTeamStatus(status)) continue;

      totals[status]++;
      const row = byTeam.get(workOrder.assigned_team);
      if (row !== undefined) row[status]++;
    }

    for (const user of users) {
      const row = user.team === undefined ? undefined : byTeam.get(user.team);
      if (row !== undefined) row.members++;
    }

    return { totals, rows };
  },
});

/**
 * Every user with their team, for the expandable member rows, the Team Members
 * tab and the Add Members picker.
 *
 * Takes no arguments on purpose: Convex caches a query per argument set, so all
 * three surfaces share one result and searching or filtering happens in the
 * browser.
 */
export const allMembers = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);

    const users = await ctx.db.query("users").collect();
    return users
      .map(toMember)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * One page of a team's work orders for the Completed / Allocated / Pending
 * tabs. Filtering on `assigned_team` cannot use an index, so the page is cut
 * from the matched set and the cursor carries an offset — the same shape
 * `workorders.list` falls back to when a search term is active.
 */
export const orders = query({
  args: {
    team: teamValidator,
    status: workOrderStatusValidator,
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const term = args.search?.trim() ?? "";
    const all = await ctx.db.query("workorders").collect();

    const matches = all
      .filter(
        (workOrder) =>
          workOrder.assigned_team === args.team &&
          deriveStatus(workOrder) === args.status &&
          matchesSearch(workOrder, term),
      )
      .sort((a, b) => b._creationTime - a._creationTime);

    const offset = Number(args.paginationOpts.cursor ?? "0") || 0;
    const page = matches.slice(offset, offset + args.paginationOpts.numItems);
    const nextOffset = offset + page.length;

    return {
      page: page.map(toOrderRow),
      total: matches.length,
      isDone: nextOffset >= matches.length,
      continueCursor: String(nextOffset),
    };
  },
});

/**
 * Moves a user into `team`.
 *
 * A user belongs to exactly one team, so this is both "Add Member" and
 * "Reassign" — whichever team they were in, they leave it.
 */
export const setMemberTeam = mutation({
  args: { user_id: v.id("users"), team: teamValidator },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const user = await ctx.db.get(args.user_id);
    if (user === null) {
      throw new Error("User not found");
    }

    await ctx.db.patch(args.user_id, { team: args.team });
  },
});

/** Takes a user out of their team. The account itself is left alone. */
export const removeMember = mutation({
  args: { user_id: v.id("users") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const user = await ctx.db.get(args.user_id);
    if (user === null) {
      throw new Error("User not found");
    }

    await ctx.db.patch(args.user_id, { team: undefined });
  },
});
