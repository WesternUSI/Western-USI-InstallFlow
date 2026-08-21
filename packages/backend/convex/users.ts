import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { teamValidator } from "./teams";

export type UserStatus = "active" | "invitation_sent" | "idle";

/**
 * No team means idle regardless of sign-in history — this is what the "Idle
 * Users" dashboard tile counts. Otherwise, an account is "Invitation Sent"
 * until the `session.created` webhook records a first real sign-in, and
 * "Active" after that.
 */
export function deriveUserStatus(user: Pick<Doc<"users">, "team" | "last_sign_in_at">): UserStatus {
  if (user.team === undefined) return "idle";
  if (user.last_sign_in_at === undefined) return "invitation_sent";
  return "active";
}

/**
 * Random credential handed to a newly invited installer, or generated fresh
 * on a reset. `skip_password_checks` on the Clerk call still bypasses the
 * breach/strength check, but the instance's minimum length applies, so this
 * is generated long and mixed on purpose.
 */
function generatePassword(): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => charset[n % charset.length]).join("");
}

function toRow(user: Doc<"users">) {
  return {
    _id: user._id,
    name: user.name ?? user.email,
    email: user.email,
    team: user.team,
    role: user.role,
    status: deriveUserStatus(user),
  };
}

function toDetailRow(user: Doc<"users">) {
  return {
    _id: user._id,
    clerk_id: user.clerk_id,
    name: user.name ?? user.email,
    email: user.email,
    team: user.team,
    role: user.role,
    status: deriveUserStatus(user),
  };
}

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

/**
 * Every account for the Users Management table. Takes no arguments on
 * purpose — the table is small enough to search, filter and paginate in the
 * browser, the same way `teams.allMembers` is shared across the Teams screens.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const users = await ctx.db.query("users").collect();
    return users.map(toRow).sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** The three headline tiles on Users Management. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const users = await ctx.db.query("users").collect();
    let activeInstallers = 0;
    let idle = 0;

    for (const user of users) {
      const status = deriveUserStatus(user);
      if (status === "idle") idle++;
      if (status === "active" && user.role === "installer") activeInstallers++;
    }

    return { total: users.length, activeInstallers, idle };
  },
});

/** One account for the User Details page. */
export const get = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db.get(args.id);
    return user === null ? null : toDetailRow(user);
  },
});

/**
 * Finishes account creation after Clerk has issued a `clerk_id`.
 *
 * Runs whether or not the `user.created` webhook has already inserted a bare
 * row: `upsertUser` only ever touches `clerk_id`/`email`/`name`/`image_url`
 * on an existing row, so whichever of the two runs second cannot clobber the
 * other's fields.
 */
export const finishInvite = internalMutation({
  args: {
    clerk_id: v.string(),
    email: v.string(),
    name: v.string(),
    team: v.optional(teamValidator),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", args.clerk_id))
      .unique();

    const patch = {
      email: args.email,
      name: args.name,
      team: args.team,
      role: "installer" as const,
      invited_at: Date.now(),
      must_change_password: true,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("users", { clerk_id: args.clerk_id, ...patch });
    }
  },
});

/**
 * Creates a Clerk account directly through the Backend API and marks it
 * invited. `skip_password_checks` bypasses Clerk's breach/strength check on
 * the admin-generated password, and — unlike a self-serve sign-up — an
 * account created this way has no pending verification step: its email is
 * already usable to sign in, with no code or link required.
 */
export const inviteInstaller = action({
  args: {
    full_name: v.string(),
    work_email: v.string(),
    team: v.optional(teamValidator),
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

    const fullName = args.full_name.trim();
    const [firstName, ...rest] = fullName.split(/\s+/);
    const lastName = rest.join(" ");
    const password = generatePassword();

    const response = await fetch("https://api.clerk.com/v1/users", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clerkSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email_address: [args.work_email],
        password,
        skip_password_checks: true,
        first_name: firstName,
        last_name: lastName === "" ? undefined : lastName,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create Clerk user: ${response.status} ${await response.text()}`);
    }

    const created = (await response.json()) as { id: string };

    await ctx.runMutation(internal.users.finishInvite, {
      clerk_id: created.id,
      email: args.work_email,
      name: fullName,
      team: args.team,
    });

    await ctx.scheduler.runAfter(0, internal.email.sendInviteEmail, {
      to: args.work_email,
      name: fullName,
      password,
    });

    return { email: args.work_email, password };
  },
});

export const markCredentialsResent = internalMutation({
  args: { user_id: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.user_id, { invited_at: Date.now(), must_change_password: true });
  },
});

/** Patches the caller's own row — split out of `completePasswordChange` so that action can call it as a mutation step. */
export const clearMustChangePassword = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();
    if (user === null) {
      throw new Error("User not found");
    }

    await ctx.db.patch(user._id, { must_change_password: false });
  },
});

/**
 * Sets the caller's own password directly through the Clerk Backend API —
 * the same mechanism Invite/Resend use, chosen specifically so this does not
 * need their current (admin-generated) password the way Clerk's frontend
 * `user.updatePassword()` would. Clears `must_change_password` on success so
 * the mandatory gate in `(tabs)/_layout.tsx` lets them through.
 */
export const completePasswordChange = action({
  args: { new_password: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new Error("CLERK_SECRET_KEY is not configured on this Convex deployment");
    }

    await clerkFetch(`/users/${identity.subject}`, clerkSecretKey, {
      method: "PATCH",
      body: JSON.stringify({ password: args.new_password }),
    });

    await ctx.runMutation(api.users.clearMustChangePassword, {});
  },
});

/**
 * Nothing is stored to "re-send" — passwords never touch Convex — so this
 * generates a fresh one, sets it directly on Clerk, and emails it to the
 * account's login address the same way a first invite does.
 */
export const resendCredentials = action({
  args: { user_id: v.id("users") },
  handler: async (ctx, args): Promise<{ email: string; password: string }> => {
    const caller = await ctx.runQuery(api.users.getCurrentUser, {});
    if (!caller || caller.role !== "admin") {
      throw new Error("Not authorized");
    }

    const account = await ctx.runQuery(internal.users.getAccountForUpdate, {
      id: args.user_id,
    });
    if (account === null) {
      throw new Error("User not found");
    }

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new Error("CLERK_SECRET_KEY is not configured on this Convex deployment");
    }

    const password = generatePassword();
    await clerkFetch(`/users/${account.clerk_id}`, clerkSecretKey, {
      method: "PATCH",
      body: JSON.stringify({ password, skip_password_checks: true }),
    });

    await ctx.runMutation(internal.users.markCredentialsResent, { user_id: args.user_id });
    await ctx.scheduler.runAfter(0, internal.email.sendInviteEmail, {
      to: account.email,
      name: account.name,
      password,
    });

    return { email: account.email, password };
  },
});

/** Thin wrapper so every Clerk Backend API call shares auth headers and error handling. */
async function clerkFetch(path: string, secretKey: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    let message = body;
    try {
      const parsed = JSON.parse(body) as { errors?: { long_message?: string; message?: string }[] };
      message = parsed.errors?.[0]?.long_message ?? parsed.errors?.[0]?.message ?? body;
    } catch {
      // Not JSON — fall back to the raw body.
    }
    throw new Error(message);
  }

  return response;
}

/**
 * Looked up through an internal query, not the public `get`, so `updateAccount`
 * (defined further down in this file) does not call back into an export of its
 * own file — that circular reference is what makes TypeScript fail to infer
 * either function's type.
 */
export const getAccountForUpdate = internalQuery({
  args: { id: v.id("users") },
  handler: async (ctx, args): Promise<{ clerk_id: string; email: string; name: string } | null> => {
    const user = await ctx.db.get(args.id);
    return user === null ? null : { clerk_id: user.clerk_id, email: user.email, name: user.name ?? user.email };
  },
});

export const applyAccountUpdate = internalMutation({
  args: {
    user_id: v.id("users"),
    name: v.string(),
    team: v.optional(teamValidator),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {
      name: args.name.trim() || undefined,
      team: args.team,
    };
    if (args.email !== undefined) patch.email = args.email;

    await ctx.db.patch(args.user_id, patch);
  },
});

/**
 * Applies name/team and a changed work email from the User Details form.
 * Password lives only on Clerk and is never edited here — resetting it is
 * "Send Updated Credentials" now, which generates and shares a fresh one.
 *
 * Changing the email creates a new, already-verified email address (Backend
 * API-created addresses skip the confirmation link the same way account
 * creation does), swaps it in as primary, then deletes the old address —
 * Clerk does not allow patching an email string directly onto a user.
 */
export const updateAccount = action({
  args: {
    user_id: v.id("users"),
    name: v.string(),
    team: v.optional(teamValidator),
    work_email: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const caller = await ctx.runQuery(api.users.getCurrentUser, {});
    if (!caller || caller.role !== "admin") {
      throw new Error("Not authorized");
    }

    const account = await ctx.runQuery(internal.users.getAccountForUpdate, { id: args.user_id });
    if (account === null) {
      throw new Error("User not found");
    }

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new Error("CLERK_SECRET_KEY is not configured on this Convex deployment");
    }

    const workEmail = args.work_email?.trim();
    const emailChanged = !!workEmail && workEmail !== account.email;

    if (emailChanged) {
      const createdEmail = await clerkFetch("/email_addresses", clerkSecretKey, {
        method: "POST",
        body: JSON.stringify({
          user_id: account.clerk_id,
          email_address: workEmail,
          verified: true,
          primary: false,
        }),
      });
      const newEmail = (await createdEmail.json()) as { id: string };

      await clerkFetch(`/users/${account.clerk_id}`, clerkSecretKey, {
        method: "PATCH",
        body: JSON.stringify({ primary_email_address_id: newEmail.id }),
      });

      // Best-effort cleanup: leaving the old address behind is harmless, so a
      // failed delete here should not fail the whole save.
      const current = await clerkFetch(`/users/${account.clerk_id}`, clerkSecretKey);
      const clerkUser = (await current.json()) as { email_addresses?: { id: string }[] };
      for (const address of clerkUser.email_addresses ?? []) {
        if (address.id === newEmail.id) continue;
        await clerkFetch(`/email_addresses/${address.id}`, clerkSecretKey, {
          method: "DELETE",
        }).catch(() => {});
      }
    }

    await ctx.runMutation(internal.users.applyAccountUpdate, {
      user_id: args.user_id,
      name: args.name,
      team: args.team,
      email: emailChanged ? (workEmail as string) : undefined,
    });
  },
});

/**
 * Records a real sign-in from the Clerk `session.created` webhook. Only the
 * first one matters — it is what turns "Invitation Sent" into "Active" — so
 * later sign-ins are a no-op.
 */
export const markSignedIn = internalMutation({
  args: { clerk_id: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", args.clerk_id))
      .unique();

    if (user !== null && user.last_sign_in_at === undefined) {
      await ctx.db.patch(user._id, { last_sign_in_at: Date.now() });
    }
  },
});
