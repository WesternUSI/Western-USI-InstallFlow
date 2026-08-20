import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";

async function requireIdentity(ctx: { auth: { getUserIdentity: () => Promise<unknown> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("Not authenticated");
  }
}

function toRow(notification: Doc<"notifications">) {
  return {
    _id: notification._id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    work_order_id: notification.work_order_id,
    read: notification.read,
    created_at: notification._creationTime,
  };
}

const RECENT_LIMIT = 50;

/** The bell dropdown's contents — most recent first, one shared inbox. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);

    const notifications = await ctx.db.query("notifications").order("desc").take(RECENT_LIMIT);

    return notifications.map(toRow);
  },
});

export const markRead = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    await ctx.db.patch(args.id, { read: true });
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_read", (q) => q.eq("read", false))
      .collect();

    for (const notification of unread) {
      await ctx.db.patch(notification._id, { read: true });
    }

    return { updated: unread.length };
  },
});
