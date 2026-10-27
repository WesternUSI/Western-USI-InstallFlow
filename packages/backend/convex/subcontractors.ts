import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { holdsAccreditations, requireAdmin } from "./permissions";

/** A trimmed value, or undefined when it is blank — so an empty form field is "not given". */
function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

/**
 * Active subcontractors, for the admin panel's lists and the invite form's
 * dropdown. Readable by any signed-in user, like `users.list` — only creating
 * one (`add`) is admin-only.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    if ((await ctx.auth.getUserIdentity()) === null) {
      throw new Error("Not authenticated");
    }

    const subcontractors = await ctx.db.query("subcontractors").collect();
    return subcontractors
      .filter((subcontractor) => !subcontractor.archived)
      .map((subcontractor) => ({
        _id: subcontractor._id,
        name: subcontractor.name,
        abn: subcontractor.abn,
        contact_name: subcontractor.contact_name,
        contact_email: subcontractor.contact_email,
        contact_phone: subcontractor.contact_phone,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * Adds a subcontractor business (WHS framework 4D). Its people — the
 * subcontractor logins and their workers — are invited afterwards from the
 * invite form and attached to it; the contact fields here are just the
 * business's primary contact on record.
 */
export const add = mutation({
  args: {
    name: v.string(),
    abn: v.optional(v.string()),
    contact_name: v.optional(v.string()),
    contact_email: v.optional(v.string()),
    contact_phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const name = args.name.trim();
    if (name === "") {
      throw new ConvexError("Enter the subcontractor's business name.");
    }

    // Names are the only thing admins pick a subcontractor by, so two active
    // ones with the same name would be indistinguishable in the dropdown.
    const existing = await ctx.db.query("subcontractors").collect();
    if (existing.some((row) => !row.archived && row.name.toLowerCase() === name.toLowerCase())) {
      throw new ConvexError("A subcontractor with that name already exists.");
    }

    const id = await ctx.db.insert("subcontractors", {
      name,
      abn: clean(args.abn),
      contact_name: clean(args.contact_name),
      contact_email: clean(args.contact_email),
      contact_phone: clean(args.contact_phone),
      archived: false,
    });

    // Its workers must hold every accreditation type to begin with (decision R1).
    const types = await ctx.db.query("accreditation_types").collect();
    for (const type of types.filter((row) => !row.archived)) {
      await ctx.db.insert("accreditation_requirements", { subcontractor_id: id, type_id: type._id });
    }

    return id;
  },
});

/**
 * A subcontractor's logins for its Workers tab, each with whether it is also
 * one of the company's workers right now and why (decision R6), so the admin
 * can set the sole-trader switch.
 */
export const logins = query({
  args: { subcontractor_id: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const subcontractorId = ctx.db.normalizeId("subcontractors", args.subcontractor_id);
    if (subcontractorId === null) return [];
    const logins = (await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "subcontractor")).collect()).filter(
      (user) => user.subcontractor_id === subcontractorId,
    );
    return await Promise.all(
      logins.map(async (login) => {
        const hasEvidence =
          (await ctx.db.query("whs_records").withIndex("by_worker", (q) => q.eq("worker_id", login._id)).first()) !== null;
        return {
          id: login._id,
          sole_trader: login.sole_trader,
          is_worker: holdsAccreditations(login, hasEvidence),
          opened_app: login.opened_installer_app_at !== undefined,
          has_evidence: hasEvidence,
        };
      }),
    );
  },
});
