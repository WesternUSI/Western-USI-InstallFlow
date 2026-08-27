import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx, mutation, query } from "./_generated/server";
import { requireAdmin } from "./permissions";

/** Addresses are compared case-insensitively, so one form is stored. */
function normalise(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Deliberately loose. This guards against slips like a missing `@`, not against
 * an address that does not exist — only sending can tell you that, and a
 * stricter pattern would reject valid addresses the business actually uses.
 */
function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export interface ResolvedRecipient {
  /** Null while the address is still an implicit admin — see `materialise`. */
  id: Id<"email_recipients"> | null;
  email: string;
  source: "admin" | "manual";
  enabled: boolean;
  /** The admin account's name, when this address belongs to one. */
  name?: string;
}

/**
 * The completion email's audience, as both the admin page and the sender see it.
 *
 * Stored rows, minus tombstones, plus every admin who has no row at all. That
 * last part is what "admins are in the list by default" means, and it is
 * computed rather than written so a query never has to mutate.
 */
async function resolveRecipients(ctx: QueryCtx): Promise<ResolvedRecipient[]> {
  const [rows, users] = await Promise.all([
    ctx.db.query("email_recipients").collect(),
    ctx.db.query("users").collect(),
  ]);

  const adminNames = new Map<string, string>();
  for (const user of users) {
    if (user.role === "admin") adminNames.set(normalise(user.email), user.name ?? user.email);
  }

  const stored = new Set(rows.map((row) => row.email));
  const resolved: ResolvedRecipient[] = [];

  for (const row of rows) {
    if (row.removed) continue;
    resolved.push({
      id: row._id,
      email: row.email,
      source: row.source,
      enabled: row.enabled,
      name: adminNames.get(row.email),
    });
  }

  for (const [email, name] of adminNames) {
    if (stored.has(email)) continue;
    resolved.push({ id: null, email, source: "admin", enabled: true, name });
  }

  return resolved.sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * Who a completion email actually goes to. Used by
 * `workorders.getCompletionEmailData`, so the page and the send can never
 * disagree about the audience.
 */
export async function enabledRecipientEmails(ctx: QueryCtx): Promise<string[]> {
  const resolved = await resolveRecipients(ctx);
  return resolved.filter((recipient) => recipient.enabled).map((recipient) => recipient.email);
}

/**
 * Gives an implicit admin a real row, so there is something to toggle or
 * tombstone. Called on the first write against such an address, not before.
 */
async function materialise(ctx: MutationCtx, email: string): Promise<Id<"email_recipients">> {
  const existing = await ctx.db
    .query("email_recipients")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  if (existing !== null) return existing._id;

  const users = await ctx.db.query("users").collect();
  const admin = users.find((user) => user.role === "admin" && normalise(user.email) === email);
  if (admin === undefined) {
    throw new Error("That address is not on the list");
  }

  return await ctx.db.insert("email_recipients", {
    email,
    source: "admin",
    enabled: true,
    removed: false,
    clerk_id: admin.clerk_id,
  });
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await resolveRecipients(ctx);
  },
});

/**
 * Accounts that could be added but are not on the list yet.
 *
 * Every role, not just admins: office staff and installers have work emails
 * too, and the point of the list is that it is no longer tied to a role.
 * A tombstoned address reappears here, which is how a removed admin gets put
 * back without anyone having to retype it.
 */
export const addableUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const resolved = await resolveRecipients(ctx);
    const taken = new Set(resolved.map((recipient) => recipient.email));

    const users = await ctx.db.query("users").collect();
    return users
      .filter((user) => !taken.has(normalise(user.email)))
      .map((user) => ({
        _id: user._id,
        name: user.name ?? user.email,
        email: normalise(user.email),
        role: user.role,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Adds an address that belongs to nobody in particular — a shared inbox, say. */
export const addRecipient = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const email = normalise(args.email);
    if (!isPlausibleEmail(email)) {
      throw new Error("That doesn't look like an email address");
    }

    const existing = await ctx.db
      .query("email_recipients")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (existing !== null) {
      // Re-adding something previously removed revives it rather than failing:
      // the tombstone is bookkeeping, and the operator's intent is plain.
      if (existing.removed) {
        await ctx.db.patch(existing._id, { removed: false, enabled: true });
        return;
      }
      throw new Error(`${email} is already on the list`);
    }

    // An admin who has never been touched here has no row yet, but is already
    // receiving — adding them again would be a duplicate the list can't show.
    const users = await ctx.db.query("users").collect();
    if (users.some((user) => user.role === "admin" && normalise(user.email) === email)) {
      throw new Error(`${email} is already on the list as an admin`);
    }

    await ctx.db.insert("email_recipients", {
      email,
      source: "manual",
      enabled: true,
      removed: false,
    });
  },
});

/** Stops (or resumes) sending, keeping the address on the list either way. */
export const setEnabled = mutation({
  args: { email: v.string(), enabled: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const id = await materialise(ctx, normalise(args.email));
    await ctx.db.patch(id, { enabled: args.enabled });
  },
});

/**
 * Takes an address off the list for good.
 *
 * Tombstoned rather than deleted: an admin's address is otherwise put straight
 * back by the default, and Delete would appear to do nothing.
 */
export const removeRecipient = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const id = await materialise(ctx, normalise(args.email));
    await ctx.db.patch(id, { removed: true, enabled: false });
  },
});
