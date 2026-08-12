import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, internalMutation, query } from "./_generated/server";

/**
 * The signed-in user shaped for the admin panel chrome. Unlike
 * `getCurrentUser` it never returns null for a signed-in caller: if the Clerk
 * webhook has not created the row yet, it falls back to the token claims so the
 * sidebar still has a name to show.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();

    if (user === null) {
      return {
        _id: null,
        name: identity.name ?? identity.email ?? "User",
        email: identity.email ?? "",
        image_url: undefined,
        team: undefined,
        role: undefined,
      };
    }

    return {
      _id: user._id,
      name: user.name ?? user.email,
      email: user.email,
      image_url: user.image_url,
      team: user.team,
      role: user.role,
    };
  },
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return null;
    }

    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();
  },
});
export const upsertUser = internalMutation({
  args: {
    clerk_id: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    image_url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", args.clerk_id))
      .unique();

    if (existing) {
      // `team` and `role` are set by an admin in the Convex dashboard, not by
      // Clerk, so they are deliberately left untouched here.
      await ctx.db.patch(existing._id, {
        clerk_id: args.clerk_id,
        email: args.email,
        name: args.name,
        image_url: args.image_url,
      });
    } else {
      await ctx.db.insert("users", { ...args, team: undefined, role: "installer" });
    }
  },
});

export const deleteUser = internalMutation({
  args: {
    clerk_id: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", args.clerk_id))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

/**
 * Admin-triggered account removal: deletes the user on Clerk (the source of
 * truth) and removes the local Convex row immediately, rather than waiting
 * on the `user.deleted` webhook round-trip. That webhook still fires after
 * this runs and calls `deleteUser` again — a harmless no-op since the row
 * is already gone.
 */
export const removeUser = action({
  args: {
    clerk_id: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await ctx.runQuery(api.users.getCurrentUser, {});
    if (!caller || caller.role !== "admin") {
      throw new Error("Not authorized");
    }

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new Error("CLERK_SECRET_KEY is not configured on this Convex deployment");
    }

    const response = await fetch(`https://api.clerk.com/v1/users/${args.clerk_id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${clerkSecretKey}`,
      },
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete Clerk user: ${response.status} ${await response.text()}`);
    }

    await ctx.runMutation(internal.users.deleteUser, { clerk_id: args.clerk_id });
  },
});
