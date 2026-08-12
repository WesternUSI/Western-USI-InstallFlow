import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

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
