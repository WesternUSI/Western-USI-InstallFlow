import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/** Admin by role, or an installer/office account that was also invited as an admin. */
export function isAdminUser(user: Pick<Doc<"users">, "role" | "has_admin_access">): boolean {
  return user.role === "admin" || user.has_admin_access === true;
}

/**
 * Throws unless the caller is a signed-in admin.
 *
 * The panel's UI hides admin-only controls from office staff, but that is a
 * courtesy — see design.md §3.3. Anything irreversible, or anything that
 * decides who finds out about work being done, re-checks the role here.
 */
export async function requireAdmin(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
    .unique();

  if (user === null || !isAdminUser(user)) {
    throw new Error("Not authorized");
  }

  return user;
}
