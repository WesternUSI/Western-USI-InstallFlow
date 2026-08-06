import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

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
      await ctx.db.patch(existing._id, {
        clerk_id: args.clerk_id,
        email: args.email,
        name: args.name,
        image_url: args.image_url,
      });
    } else {
      await ctx.db.insert("users", args);
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
