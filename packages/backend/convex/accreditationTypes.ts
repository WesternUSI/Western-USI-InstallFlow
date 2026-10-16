import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { DEFAULT_REMINDER_DAYS, requireCaller } from "./accreditations";
import { isAdminUser } from "./permissions";

/**
 * The admin's list of accreditation types (backlog "manage accreditation
 * types", decision AD31): add a type, rename it, choose who must hold it, or
 * remove it. "Who must hold it" is per entity: Western USI or a subcontractor
 * (decisions R1, R4). Reminders always use the framework 7 default.
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

/** Makes the type's requirement rows match `owners` exactly. */
async function setOwners(ctx: MutationCtx, typeId: Id<"accreditation_types">, owners: (Id<"subcontractors"> | undefined)[]) {
  const existing = await ctx.db
    .query("accreditation_requirements")
    .withIndex("by_type", (q) => q.eq("type_id", typeId))
    .collect();
  for (const row of existing) {
    if (!owners.includes(row.subcontractor_id)) await ctx.db.delete(row._id);
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
    await requireAdmin(ctx);
    const name = await checkName(ctx, args.name);
    const owners = await checkOwners(ctx, args.required_for);
    const last = (await ctx.db.query("accreditation_types").collect()).reduce((max, type) => Math.max(max, type.sort_order), 0);
    const id = await ctx.db.insert("accreditation_types", {
      name,
      reminder_days: DEFAULT_REMINDER_DAYS,
      sort_order: last + 1,
      archived: false,
    });
    await setOwners(ctx, id, owners);
    return id;
  },
});

export const adminUpdate = mutation({
  args: { type_id: v.id("accreditation_types"), name: v.string(), required_for: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const type = await ctx.db.get(args.type_id);
    if (type === null || type.archived) throw new ConvexError("That accreditation no longer exists.");
    const name = await checkName(ctx, args.name, type._id);
    const owners = await checkOwners(ctx, args.required_for);
    if (name !== type.name) await ctx.db.patch(type._id, { name });
    await setOwners(ctx, type._id, owners);
  },
});

/**
 * Removes a type from use: no one is asked for it any more. It is archived,
 * never deleted (framework 11), so evidence already uploaded is kept.
 */
export const adminRemove = mutation({
  args: { type_id: v.id("accreditation_types") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const type = await ctx.db.get(args.type_id);
    if (type === null || type.archived) throw new ConvexError("That accreditation no longer exists.");
    await setOwners(ctx, type._id, []);
    await ctx.db.patch(type._id, { archived: true });
  },
});

/**
 * Adds or removes one accreditation from one entity's required list, from the
 * entity's Accreditations tab (decision AD37). `entity` is "western-usi" or a
 * subcontractor id. Evidence already uploaded is kept either way.
 */
export const adminSetRequired = mutation({
  args: { type_id: v.id("accreditation_types"), entity: v.string(), required: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
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
    }
  },
});
