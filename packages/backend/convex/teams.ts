import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { type QueryCtx, mutation, query } from "./_generated/server";
import { matchesTerm } from "./derive";
import { deriveStatus, workOrderStatusValidator } from "./workorders";

/**
 * Teams are a fixed set, not a table: `users.team` and the native app's
 * allocation flow both validate against these exact five literals, so a team
 * only exists here.
 */
export const TEAMS = ["Team 1", "Team 2", "Team 3", "Team 4", "Team 5"] as const;

export type Team = (typeof TEAMS)[number];

export const teamValidator = v.union(
  v.literal("Team 1"),
  v.literal("Team 2"),
  v.literal("Team 3"),
  v.literal("Team 4"),
  v.literal("Team 5"),
);

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
    password: user.password,
    role: user.role,
    team: user.team,
  };
}

function toOrderRow(workOrder: Doc<"workorders">) {
  return {
    _id: workOrder._id,
    status: deriveStatus(workOrder),
    site: workOrder.site,
    panel_split: workOrder.panel_split,
    advertiser_campaign: workOrder.advertiser_campaign,
    existing_advertiser: workOrder.existing_advertiser,
    train_line: workOrder.train_line,
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

/**
 * One row per team for the Teams Management table, plus the headline totals.
 *
 * `assigned_team` has no index — it is an array, and allocation is written by
 * the native app one work order at a time — so this walks the table and tallies
 * in memory, the same way `workorders.counts` does.
 *
 * A work order allocated to two teams counts once for each of them but only
 * once in `totals`, so the tiles report work orders rather than assignments.
 */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);

    const [workOrders, users] = await Promise.all([
      ctx.db.query("workorders").collect(),
      ctx.db.query("users").collect(),
    ]);

    const rows = TEAMS.map((team) => ({
      team,
      allocated: 0,
      completed: 0,
      pending: 0,
      members: 0,
    }));
    const byTeam = new Map(rows.map((row) => [row.team as string, row]));

    const totals = { teams: TEAMS.length, allocated: 0, completed: 0, pending: 0 };

    for (const workOrder of workOrders) {
      if (workOrder.assigned_team.length === 0) continue;

      const status = deriveStatus(workOrder);
      if (!isTeamStatus(status)) continue;

      totals[status]++;
      for (const team of workOrder.assigned_team) {
        const row = byTeam.get(team);
        if (row !== undefined) row[status]++;
      }
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
          workOrder.assigned_team.includes(args.team) &&
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
 * "Reassign" — whichever team they were in, they leave it. `additional_teams`
 * is cleared alongside: it holds teams merged into the *previous* primary team
 * by the native Allocate Installs screen, and carries no meaning once the
 * primary changes.
 */
export const setMemberTeam = mutation({
  args: { user_id: v.id("users"), team: teamValidator },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const user = await ctx.db.get(args.user_id);
    if (user === null) {
      throw new Error("User not found");
    }

    await ctx.db.patch(args.user_id, { team: args.team, additional_teams: undefined });
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

    await ctx.db.patch(args.user_id, { team: undefined, additional_teams: undefined });
  },
});
