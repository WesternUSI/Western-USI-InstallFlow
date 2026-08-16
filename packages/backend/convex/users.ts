import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  type MutationCtx,
  type QueryCtx,
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
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

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
    .unique();

  if (user === null || user.role !== "admin") {
    throw new Error("Not authorized");
  }

  return user;
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
    personal_email: user.personal_email,
    password: user.password,
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

/**
 * Merges the caller's primary team into whichever other teams are checked on
 * the Allocate Installs screen.
 *
 * Scoped by primary `team`, not by current effective membership, so merges
 * never cascade transitively through someone else's earlier merge: every
 * user whose *admin-assigned* `team` matches the caller's gets their
 * `additional_teams` replaced with exactly the non-primary teams checked.
 * Saving with the primary as the only checked team clears `additional_teams`
 * again — this is how a merge gets undone (uncheck the extra team, Save).
 */
export const mergeTeams = mutation({
  args: {
    checkedTeams: v.array(
      v.union(
        v.literal("Team 1"),
        v.literal("Team 2"),
        v.literal("Team 3"),
        v.literal("Team 4"),
        v.literal("Team 5"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    const actor = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
      .unique();

    if (actor === null) {
      throw new Error("User not found");
    }
    if (actor.team === undefined) {
      throw new Error("Ask your admin to assign your primary team first");
    }
    if (!args.checkedTeams.includes(actor.team)) {
      throw new Error("Your primary team cannot be unchecked");
    }

    const additionalTeams = [...new Set(args.checkedTeams.filter((t) => t !== actor.team))];

    const teammates = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("team"), actor.team))
      .collect();

    for (const teammate of teammates) {
      await ctx.db.patch(teammate._id, {
        additional_teams: additionalTeams.length > 0 ? additionalTeams : undefined,
      });
    }

    return { updated: teammates.length, additionalTeams };
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
    personal_email: v.optional(v.string()),
    team: v.optional(teamValidator),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerk_id", args.clerk_id))
      .unique();

    const patch = {
      email: args.email,
      name: args.name,
      personal_email: args.personal_email,
      team: args.team,
      password: args.password,
      role: "installer" as const,
      invited_at: Date.now(),
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
    personal_email: v.optional(v.string()),
    team: v.optional(teamValidator),
    // Admin-typed or admin-generated on the Invite Installer form; falls back
    // to a server-generated one only if the client somehow omits it.
    password: v.optional(v.string()),
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
    const password = args.password?.trim() || generatePassword();

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
      personal_email: args.personal_email,
      team: args.team,
      password,
    });

    return { email: args.work_email, password };
  },
});

/**
 * Re-shows an existing account's stored credentials and marks them as sent
 * again. No email goes out yet — the admin reads them off the confirmation
 * dialog and hands them over directly.
 */
export const resendCredentials = mutation({
  args: { user_id: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const user = await ctx.db.get(args.user_id);
    if (user === null) {
      throw new Error("User not found");
    }
    if (user.password === undefined) {
      throw new Error("This account has no password on record — use Reset Password instead.");
    }

    await ctx.db.patch(args.user_id, { invited_at: Date.now() });
    return { email: user.email, password: user.password };
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
    throw new Error(`Clerk API error (${path}): ${response.status} ${await response.text()}`);
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
  handler: async (ctx, args): Promise<{ clerk_id: string; email: string } | null> => {
    const user = await ctx.db.get(args.id);
    return user === null ? null : { clerk_id: user.clerk_id, email: user.email };
  },
});

export const applyAccountUpdate = internalMutation({
  args: {
    user_id: v.id("users"),
    name: v.string(),
    personal_email: v.optional(v.string()),
    team: v.optional(teamValidator),
    email: v.optional(v.string()),
    password: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {
      name: args.name.trim() || undefined,
      personal_email: args.personal_email?.trim() || undefined,
      team: args.team,
      // A changed primary team invalidates whatever was merged into the old one.
      additional_teams: undefined,
    };
    if (args.email !== undefined) patch.email = args.email;
    if (args.password !== undefined) {
      patch.password = args.password;
      // A changed password makes the old credentials stale, the same as a
      // fresh invite — the admin still has to hand the new one over.
      patch.invited_at = Date.now();
    }

    await ctx.db.patch(args.user_id, patch);
  },
});

/**
 * Applies every field on the User Details form in one call. Name, personal
 * email and team are Convex-only; a changed work email or password go through
 * the Clerk Backend API first, since Clerk — not Convex — is the login system
 * of record.
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
    personal_email: v.optional(v.string()),
    team: v.optional(teamValidator),
    work_email: v.optional(v.string()),
    password: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ email: string; password: string } | null> => {
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
    const password = args.password?.trim();
    const passwordChanged = !!password;

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

    if (passwordChanged) {
      await clerkFetch(`/users/${account.clerk_id}`, clerkSecretKey, {
        method: "PATCH",
        body: JSON.stringify({ password, skip_password_checks: true }),
      });
    }

    const finalEmail = emailChanged ? (workEmail as string) : account.email;

    await ctx.runMutation(internal.users.applyAccountUpdate, {
      user_id: args.user_id,
      name: args.name,
      personal_email: args.personal_email,
      team: args.team,
      email: emailChanged ? finalEmail : undefined,
      password: passwordChanged ? password : undefined,
    });

    return passwordChanged ? { email: finalEmail, password: password as string } : null;
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
