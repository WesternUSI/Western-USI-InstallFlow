import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { DEFAULT_REMINDER_DAYS, requireCaller } from "./accreditations";
import { holdsAccreditations, isAdminUser } from "./permissions";

/**
 * The admin's list of accreditation types (backlog "manage accreditation
 * types", decision AD31): add a type, rename it, choose who must hold it, or
 * remove it. "Who must hold it" is per entity: Western USI or a subcontractor
 * (decisions R1, R4), and then ticked per worker (decision AD53). Reminders
 * always use the framework 7 default.
 */

/** How Western USI is named in `required_for`; subcontractors are their ids. */
const WESTERN_USI = "western-usi";
const MAX_NAME = 80;

async function requirePanel(ctx: QueryCtx) {
  const user = await requireCaller(ctx);
  if (!isAdminUser(user)) throw new ConvexError("Only an administrator can open this.");
  return user;
}

async function requireAdmin(ctx: QueryCtx) {
  const user = await requireCaller(ctx);
  if (!isAdminUser(user)) throw new ConvexError("Only an administrator can change accreditation types.");
  return user;
}

/** The type with its "required for" list: "western-usi" and subcontractor ids. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requirePanel(ctx);
    const [types, requirements] = await Promise.all([
      ctx.db.query("accreditation_types").collect(),
      ctx.db.query("accreditation_requirements").collect(),
    ]);
    return types
      .filter((type) => !type.archived)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((type) => ({
        id: type._id,
        name: type.name,
        required_for: requirements
          .filter((row) => row.type_id === type._id)
          .map((row) => (row.subcontractor_id === undefined ? WESTERN_USI : (row.subcontractor_id as string))),
      }));
  },
});

async function checkName(ctx: QueryCtx, raw: string, except?: Id<"accreditation_types">) {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name === "") throw new ConvexError("Enter the accreditation name.");
  if (name.length > MAX_NAME) throw new ConvexError(`The name can be up to ${MAX_NAME} characters.`);
  const taken = (await ctx.db.query("accreditation_types").collect()).some(
    (type) => !type.archived && type._id !== except && type.name.toLowerCase() === name.toLowerCase(),
  );
  if (taken) throw new ConvexError(`There is already an accreditation called "${name}".`);
  return name;
}

/** "western-usi" and subcontractor ids, checked, as the requirement rows' owners. */
async function checkOwners(ctx: QueryCtx, requiredFor: string[]) {
  const owners: (Id<"subcontractors"> | undefined)[] = [];
  for (const entry of new Set(requiredFor)) {
    if (entry === WESTERN_USI) {
      owners.push(undefined);
      continue;
    }
    const id = ctx.db.normalizeId("subcontractors", entry);
    const subcontractor = id === null ? null : await ctx.db.get(id);
    if (subcontractor === null || subcontractor.archived) throw new ConvexError("One of the chosen subcontractors no longer exists. Reload and try again.");
    owners.push(subcontractor._id);
  }
  return owners;
}

/** Makes the type's requirement rows match `owners` exactly; a company taken off unticks its workers (AD53). */
async function setOwners(
  ctx: MutationCtx,
  typeId: Id<"accreditation_types">,
  owners: (Id<"subcontractors"> | undefined)[],
  actorId: Id<"users">,
) {
  const existing = await ctx.db
    .query("accreditation_requirements")
    .withIndex("by_type", (q) => q.eq("type_id", typeId))
    .collect();
  for (const row of existing) {
    if (owners.includes(row.subcontractor_id)) continue;
    await ctx.db.delete(row._id);
    await untickCompany(ctx, typeId, row.subcontractor_id, actorId);
  }
  for (const owner of owners) {
    if (!existing.some((row) => row.subcontractor_id === owner)) {
      await ctx.db.insert("accreditation_requirements", { subcontractor_id: owner, type_id: typeId });
    }
  }
}

export const adminCreate = mutation({
  args: { name: v.string(), required_for: v.array(v.string()) },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const name = await checkName(ctx, args.name);
    const owners = await checkOwners(ctx, args.required_for);
    const last = (await ctx.db.query("accreditation_types").collect()).reduce((max, type) => Math.max(max, type.sort_order), 0);
    const id = await ctx.db.insert("accreditation_types", {
      name,
      reminder_days: DEFAULT_REMINDER_DAYS,
      sort_order: last + 1,
      archived: false,
    });
    await setOwners(ctx, id, owners, admin._id);
    return id;
  },
});

export const adminUpdate = mutation({
  args: { type_id: v.id("accreditation_types"), name: v.string(), required_for: v.array(v.string()) },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const type = await ctx.db.get(args.type_id);
    if (type === null || type.archived) throw new ConvexError("That accreditation no longer exists.");
    const name = await checkName(ctx, args.name, type._id);
    const owners = await checkOwners(ctx, args.required_for);
    if (name !== type.name) await ctx.db.patch(type._id, { name });
    await setOwners(ctx, type._id, owners, admin._id);
  },
});

/**
 * Removes a type from use: no one is asked for it any more. It is archived,
 * never deleted (framework 11), so evidence already uploaded is kept.
 */
export const adminRemove = mutation({
  args: { type_id: v.id("accreditation_types") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const type = await ctx.db.get(args.type_id);
    if (type === null || type.archived) throw new ConvexError("That accreditation no longer exists.");
    await setOwners(ctx, type._id, [], admin._id);
    await ctx.db.patch(type._id, { archived: true });
  },
});

/**
 * Adds or removes one accreditation from one entity's required list, from the
 * entity's Accreditations tab (decision AD37). `entity` is "western-usi" or a
 * subcontractor id. Adding it ticks no one; removing it unticks everyone there
 * (decision AD53). Evidence already uploaded is kept either way.
 */
export const adminSetRequired = mutation({
  args: { type_id: v.id("accreditation_types"), entity: v.string(), required: v.boolean() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const type = await ctx.db.get(args.type_id);
    if (type === null || type.archived) throw new ConvexError("That accreditation no longer exists.");
    const [owner] = await checkOwners(ctx, [args.entity]);
    const rows = await ctx.db
      .query("accreditation_requirements")
      .withIndex("by_type", (q) => q.eq("type_id", type._id))
      .collect();
    const existing = rows.filter((row) => row.subcontractor_id === owner);
    if (args.required && existing.length === 0) {
      await ctx.db.insert("accreditation_requirements", { subcontractor_id: owner, type_id: type._id });
    }
    if (!args.required) {
      for (const row of existing) await ctx.db.delete(row._id);
      await untickCompany(ctx, type._id, owner, admin._id);
    }
  },
});

// ---------------------------------------------------------------------------
// Each worker's own required accreditations (decision AD53)
// ---------------------------------------------------------------------------

const companyName = async (ctx: QueryCtx, owner: Id<"subcontractors"> | undefined) =>
  owner === undefined ? "Western USI" : ((await ctx.db.get(owner))?.name ?? "the subcontractor");

/** Whether this person holds accreditations, as the register counts them (decision R6). */
async function isWorker(ctx: QueryCtx, user: Doc<"users">) {
  if (user.role === "installer") return true;
  const evidence = await ctx.db
    .query("whs_records")
    .withIndex("by_worker", (q) => q.eq("worker_id", user._id))
    .first();
  return holdsAccreditations(user, evidence !== null);
}

/** A company's people who hold accreditations, A-Z. */
async function workersOf(ctx: QueryCtx, owner: Id<"subcontractors"> | undefined) {
  const [installers, logins] = await Promise.all([
    ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "installer")).collect(),
    ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "subcontractor")).collect(),
  ]);
  const workers: Doc<"users">[] = [];
  for (const user of [...installers, ...logins]) {
    if (user.subcontractor_id === owner && (await isWorker(ctx, user))) workers.push(user);
  }
  return workers.sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
}

/** The types on a company's list, in the usual order. */
async function companyTypes(ctx: QueryCtx, owner: Id<"subcontractors"> | undefined) {
  const rows = await ctx.db
    .query("accreditation_requirements")
    .withIndex("by_subcontractor", (q) => q.eq("subcontractor_id", owner))
    .collect();
  const types = await Promise.all(rows.map((row) => ctx.db.get(row.type_id)));
  return types
    .filter((type): type is Doc<"accreditation_types"> => type !== null && !type.archived)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** Ticks or unticks one type for one worker, recording the change (framework 11). */
export async function setTick(
  ctx: MutationCtx,
  workerId: Id<"users">,
  typeId: Id<"accreditation_types">,
  on: boolean,
  actorId: Id<"users">,
  details?: string,
) {
  const rows = (
    await ctx.db
      .query("accreditation_assignments")
      .withIndex("by_worker", (q) => q.eq("worker_id", workerId))
      .collect()
  ).filter((row) => row.type_id === typeId);
  if (on === rows.length > 0) return;
  if (on) await ctx.db.insert("accreditation_assignments", { worker_id: workerId, type_id: typeId });
  else for (const row of rows) await ctx.db.delete(row._id);
  await ctx.db.insert("accreditation_assignment_audit", {
    worker_id: workerId,
    type_id: typeId,
    action: on ? "required" : "not_required",
    actor_id: actorId,
    details,
  });
}

/** A type taken off a company's list is unticked for everyone ticked there, so adding it back starts unticked. */
async function untickCompany(
  ctx: MutationCtx,
  typeId: Id<"accreditation_types">,
  owner: Id<"subcontractors"> | undefined,
  actorId: Id<"users">,
) {
  const details = `Removed from ${await companyName(ctx, owner)}'s list.`;
  for (const row of await ctx.db
    .query("accreditation_assignments")
    .withIndex("by_type", (q) => q.eq("type_id", typeId))
    .collect()) {
    const worker = await ctx.db.get(row.worker_id);
    if (worker === null || worker.subcontractor_id === owner) await setTick(ctx, row.worker_id, typeId, false, actorId, details);
  }
}

/**
 * One person's required accreditations, for User Details: every type on their
 * company's list, ticked or not. Null when they don't hold accreditations.
 */
export const forWorker = query({
  args: { user_id: v.string() },
  handler: async (ctx, args) => {
    await requirePanel(ctx);
    const id = ctx.db.normalizeId("users", args.user_id);
    const user = id === null ? null : await ctx.db.get(id);
    if (user === null || !(await isWorker(ctx, user))) return null;
    const [types, ticked] = await Promise.all([
      companyTypes(ctx, user.subcontractor_id),
      ctx.db
        .query("accreditation_assignments")
        .withIndex("by_worker", (q) => q.eq("worker_id", user._id))
        .collect(),
    ]);
    const tickedIds = new Set(ticked.map((row) => row.type_id));
    return {
      company: await companyName(ctx, user.subcontractor_id),
      items: types.map((type) => ({ id: type._id, name: type.name, ticked: tickedIds.has(type._id) })),
    };
  },
});

/** Sets exactly which of their company's accreditations one person must hold. */
export const adminSetForWorker = mutation({
  args: { user_id: v.id("users"), type_ids: v.array(v.id("accreditation_types")) },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const user = await ctx.db.get(args.user_id);
    if (user === null) throw new ConvexError("That person no longer exists.");
    if (!(await isWorker(ctx, user))) throw new ConvexError(`${user.name ?? user.email} doesn't hold accreditations.`);
    const types = await companyTypes(ctx, user.subcontractor_id);
    for (const typeId of args.type_ids) {
      if (!types.some((type) => type._id === typeId)) {
        throw new ConvexError(`One of the ticked accreditations is no longer on ${await companyName(ctx, user.subcontractor_id)}'s list. Reload and try again.`);
      }
    }
    for (const type of types) await setTick(ctx, user._id, type._id, args.type_ids.includes(type._id), admin._id);
  },
});

/** One accreditation on a company's list, with that company's workers ticked or not ("Choose workers"). */
export const workersForType = query({
  args: { type_id: v.id("accreditation_types"), entity: v.string() },
  handler: async (ctx, args) => {
    await requirePanel(ctx);
    const [owner] = await checkOwners(ctx, [args.entity]);
    const [workers, ticked] = await Promise.all([
      workersOf(ctx, owner),
      ctx.db
        .query("accreditation_assignments")
        .withIndex("by_type", (q) => q.eq("type_id", args.type_id))
        .collect(),
    ]);
    const tickedIds = new Set(ticked.map((row) => row.worker_id));
    return workers.map((worker) => ({ id: worker._id, name: worker.name ?? worker.email, ticked: tickedIds.has(worker._id) }));
  },
});

/** Sets exactly which of a company's workers must hold one accreditation on its list. */
export const adminSetWorkersForType = mutation({
  args: { type_id: v.id("accreditation_types"), entity: v.string(), worker_ids: v.array(v.id("users")) },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const type = await ctx.db.get(args.type_id);
    if (type === null || type.archived) throw new ConvexError("That accreditation no longer exists.");
    const [owner] = await checkOwners(ctx, [args.entity]);
    if (!(await companyTypes(ctx, owner)).some((entry) => entry._id === type._id)) {
      throw new ConvexError(`${type.name} isn't on ${await companyName(ctx, owner)}'s list. Add it first.`);
    }
    const workers = await workersOf(ctx, owner);
    for (const workerId of args.worker_ids) {
      if (!workers.some((worker) => worker._id === workerId)) {
        throw new ConvexError(`One of the ticked people no longer works for ${await companyName(ctx, owner)}. Reload and try again.`);
      }
    }
    for (const worker of workers) await setTick(ctx, worker._id, type._id, args.worker_ids.includes(worker._id), admin._id);
  },
});

/** Checks the accreditations ticked on an invite are on the company's list, before the account is created. */
export const checkInviteTicks = internalQuery({
  args: { subcontractor_id: v.optional(v.id("subcontractors")), type_ids: v.array(v.id("accreditation_types")) },
  handler: async (ctx, args) => {
    const types = await companyTypes(ctx, args.subcontractor_id);
    for (const typeId of args.type_ids) {
      if (!types.some((type) => type._id === typeId)) {
        throw new ConvexError(`One of the ticked accreditations isn't on ${await companyName(ctx, args.subcontractor_id)}'s list. Reload and try again.`);
      }
    }
  },
});
