import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/** Admin by role, or an installer/office account that was also invited as an admin. */
export function isAdminUser(user: Pick<Doc<"users">, "role" | "has_admin_access">): boolean {
  return user.role === "admin" || user.has_admin_access === true;
}

/**
 * People who never belong to a team: WHS-only people (a subcontractor's login
 * or workers) and Western USI's management, who oversee compliance rather than
 * install.
 */
export function isTeamless(user: Pick<Doc<"users">, "role" | "subcontractor_id">): boolean {
  return isWhsOnly(user) || user.role === "management";
}

/** Western USI's management by role, or an admin who was also given management access (decision AD43). */
export function isManagementUser(user: Pick<Doc<"users">, "role" | "has_management_access">): boolean {
  return user.role === "management" || user.has_management_access === true;
}

/** Who can open the compliance registers and records: admins and management (framework 3, 10). */
export function canViewCompliance(user: Pick<Doc<"users">, "role" | "has_admin_access" | "has_management_access">): boolean {
  return isAdminUser(user) || isManagementUser(user);
}

/**
 * Who may check WHS evidence and approve what waits in the register: admins,
 * and management, who verify everything that comes in (framework 10
 * "designated items"; the user designated all of them, decision AD43). One
 * function so the rule can change in one place. See V1 and AD43 in
 * docs/reference/whs-decisions.md.
 */
export function canVerifyEvidence(user: Pick<Doc<"users">, "role" | "has_admin_access" | "has_management_access">): boolean {
  return isAdminUser(user) || isManagementUser(user);
}

/**
 * A subcontractor's login or worker sees only the WHS side of the app: no work
 * orders, sites or teams. The client confirmed this for now (their
 * subcontractors work in a different field from the work orders), so it is
 * derived from the role and the subcontractor link until per-person access
 * scoping exists. This is the one place the rule lives — replace it there when
 * that lands.
 */
export function isWhsOnly(user: Pick<Doc<"users">, "role" | "subcontractor_id">): boolean {
  return user.role === "subcontractor" || user.subcontractor_id !== undefined;
}

/**
 * Who must hold accreditations (decision R6): every installer, and a
 * subcontractor login only when it is also one of the company's workers. An
 * admin sets that with the sole-trader switch; until they do, the login counts
 * once it has opened the installer app or has evidence on file. Switched off
 * always wins.
 */
export function holdsAccreditations(
  user: Pick<Doc<"users">, "role" | "sole_trader" | "opened_installer_app_at">,
  hasEvidence: boolean,
): boolean {
  if (user.role === "installer") return true;
  if (user.role !== "subcontractor" || user.sole_trader === false) return false;
  return user.sole_trader === true || user.opened_installer_app_at !== undefined || hasEvidence;
}

/**
 * Who is asked to acknowledge safety documents: installers only, Western
 * USI's and subcontractors' workers alike (decision D9). Admins,
 * management and subcontractor logins (the business accounts) are not asked.
 */
export function mustAcknowledgeDocuments(user: Pick<Doc<"users">, "role">): boolean {
  return user.role === "installer";
}

/**
 * Throws unless the caller is a signed-in admin.
 *
 * The panel's UI hides admin-only controls from non-admins, but that is a
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

/**
 * Whether a document is meant for this person (framework 4A "applicable
 * workers", decision AD33): they are one of its people, or they work for one
 * of its entities. A document with neither set is for everyone (D6); an
 * office-only one is for no one (AD52).
 */
export function documentIsFor(
  document: Pick<Doc<"whs_documents">, "for_entities" | "for_workers" | "office_only">,
  user: Pick<Doc<"users">, "_id" | "subcontractor_id">,
): boolean {
  if (document.office_only) return false;
  const entities = document.for_entities ?? [];
  const workers = document.for_workers ?? [];
  if (entities.length === 0 && workers.length === 0) return true;
  if (workers.includes(user._id)) return true;
  return entities.includes(user.subcontractor_id ?? "western-usi");
}

/**
 * Whether the installer app shows this document. The office (admins and
 * management) sees every document but office-only ones, which stay in the
 * panel (AD52); everyone else only the ones meant for them.
 */
export function canSeeDocument(
  document: Pick<Doc<"whs_documents">, "for_entities" | "for_workers" | "office_only">,
  user: Pick<Doc<"users">, "_id" | "subcontractor_id" | "role" | "has_admin_access" | "has_management_access">,
): boolean {
  if (document.office_only) return false;
  if (canViewCompliance(user)) return true;
  return documentIsFor(document, user);
}
