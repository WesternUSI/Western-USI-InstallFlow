import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { isValidIsoDate, requireCaller, requireVerifier } from "./accreditations";
import { canViewCompliance, isAdminUser } from "./permissions";
import { businessToday } from "./whsDates";
import { deriveAccreditationStatus } from "./whsStatus";
import { checkReason, describeEdit } from "./whsEdits";

/**
 * The insurance register (framework 4C): Western USI's and subcontractors'
 * policies, each with its certificates of currency. Status is worked out like
 * an accreditation's (framework 6): Missing, Awaiting verification, Renewal in
 * progress, Action required, Expired, Due soon (60 days, framework 7), Current.
 */

export const INSURANCE_REMINDER_DAYS = [60, 30, 14, 7];
const MAX_TEXT = 200;

const typeValidator = v.union(
  v.literal("workers_compensation"),
  v.literal("public_liability"),
  v.literal("motor_vehicle"),
  v.literal("professional_indemnity"),
);

export const INSURANCE_TYPE_LABELS: Record<Doc<"insurance_policies">["insurance_type"], string> = {
  workers_compensation: "Workers' Compensation",
  public_liability: "Public Liability",
  motor_vehicle: "Motor Vehicle",
  professional_indemnity: "Professional Indemnity",
};

async function requirePanel(ctx: QueryCtx) {
  const user = await requireCaller(ctx);
  if (!canViewCompliance(user)) throw new ConvexError("Only admins and management can open this.");
  return user;
}

async function requireAdmin(ctx: QueryCtx) {
  const user = await requireCaller(ctx);
  if (!isAdminUser(user)) throw new ConvexError("Only an administrator can manage insurance.");
  return user;
}

export async function certificatesOf(ctx: QueryCtx, policyId: Id<"insurance_policies">) {
  return await ctx.db
    .query("insurance_certificates")
    .withIndex("by_policy", (q) => q.eq("policy_id", policyId))
    .collect();
}

/** A policy's status from its certificates (oldest first). */
export function policyStatus(certificates: Doc<"insurance_certificates">[], today: string) {
  return deriveAccreditationStatus(
    certificates.map((certificate) => ({ state: certificate.state, expires: certificate.expires, no_expiry: false })),
    today,
    Math.max(...INSURANCE_REMINDER_DAYS),
  );
}

export async function entityName(ctx: QueryCtx, subcontractorId: Id<"subcontractors"> | undefined) {
  if (subcontractorId === undefined) return "Western USI";
  return (await ctx.db.get(subcontractorId))?.name ?? "Subcontractor";
}

async function nameOf(ctx: QueryCtx, id: Id<"users"> | undefined) {
  if (id === undefined) return undefined;
  const user = await ctx.db.get(id);
  return user === null ? "Unknown" : (user.name ?? user.email);
}

function checkDates(start: string, expires: string) {
  if (!isValidIsoDate(start)) throw new ConvexError("Select a valid policy start date.");
  if (!isValidIsoDate(expires)) throw new ConvexError("Select a valid expiry date.");
  if (expires <= start) throw new ConvexError("The expiry date must be after the start date.");
}

function text(value: string | undefined, label: string) {
  const trimmed = value?.trim() || undefined;
  if (trimmed !== undefined && trimmed.length > MAX_TEXT) throw new ConvexError(`${label} can be up to ${MAX_TEXT} characters.`);
  return trimmed;
}

async function audit(ctx: MutationCtx, entry: Omit<Doc<"insurance_audit">, "_id" | "_creationTime">) {
  await ctx.db.insert("insurance_audit", entry);
}

/** Marks earlier certificates as replaced, keeping them (framework 4C). */
async function supersedeOthers(ctx: MutationCtx, policyId: Id<"insurance_policies">, keep: Id<"insurance_certificates">, actorId: Id<"users">) {
  for (const certificate of await certificatesOf(ctx, policyId)) {
    if (certificate._id === keep || (certificate.state !== "verified" && certificate.state !== "pending")) continue;
    await ctx.db.patch(certificate._id, { state: "superseded" });
    await audit(ctx, {
      policy_id: policyId,
      certificate_id: certificate._id,
      action: "superseded",
      actor_id: actorId,
      details: `Previous certificate retained (expired ${certificate.expires}).`,
    });
  }
}

/** A one-off URL to upload a certificate of currency to. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Every policy for the Insurance Register. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requirePanel(ctx);
    const today = businessToday();
    const policies = await ctx.db
      .query("insurance_policies")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .collect();
    return await Promise.all(
      policies.map(async (policy) => {
        const certificates = await certificatesOf(ctx, policy._id);
        const current = [...certificates].reverse().find((certificate) => certificate.state === "pending" || certificate.state === "verified");
        return {
          id: policy._id,
          type: INSURANCE_TYPE_LABELS[policy.insurance_type],
          entity: await entityName(ctx, policy.subcontractor_id),
          subcontractor_id: policy.subcontractor_id,
          insurer: policy.insurer,
          coverage: policy.coverage,
          expires: current?.expires,
          status: policyStatus(certificates, today),
        };
      }),
    );
  },
});

/** One policy with all its certificates and its activity. */
export const adminDetail = query({
  args: { policy_id: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requirePanel(ctx);
    const policyId = ctx.db.normalizeId("insurance_policies", args.policy_id);
    const policy = policyId === null ? null : await ctx.db.get(policyId);
    // An archived policy still opens, read-only, so its history stays reachable (framework 11).
    if (policy === null) return null;

    const certificates = await certificatesOf(ctx, policy._id);
    const pending = [...certificates].reverse().find((certificate) => certificate.state === "pending");
    const verified = [...certificates].reverse().find((certificate) => certificate.state === "verified");
    const shown = pending ?? verified ?? certificates[certificates.length - 1];
    const trail = await ctx.db
      .query("insurance_audit")
      .withIndex("by_policy", (q) => q.eq("policy_id", policy._id))
      .order("desc")
      .take(20);

    return {
      id: policy._id,
      type: INSURANCE_TYPE_LABELS[policy.insurance_type],
      insurance_type: policy.insurance_type,
      entity: await entityName(ctx, policy.subcontractor_id),
      subcontractor_id: policy.subcontractor_id,
      insurer: policy.insurer,
      policy_number: policy.policy_number,
      coverage: policy.coverage,
      responsible: await nameOf(ctx, policy.responsible_user_id),
      responsible_id: policy.responsible_user_id,
      notes: policy.notes,
      status: policyStatus(certificates, businessToday()),
      archived: policy.archived,
      can_manage: isAdminUser(viewer) && !policy.archived,
      certificate:
        shown === undefined
          ? null
          : {
              id: shown._id,
              state: shown.state,
              start: shown.start,
              expires: shown.expires,
              file_name: shown.file_name,
              url: await ctx.storage.getUrl(shown.file_id),
              uploaded_by: await nameOf(ctx, shown.uploaded_by),
              uploaded_at: shown._creationTime,
              verified_by: await nameOf(ctx, shown.verified_by),
              verified_at: shown.verified_at,
              rejected_reason: shown.rejected_reason,
            },
      pending_certificate_id: pending?._id,
      history: certificates
        .filter((certificate) => certificate.state === "superseded")
        .reverse()
        .map((certificate) => ({ start: certificate.start, expires: certificate.expires, file_name: certificate.file_name })),
      activity: await Promise.all(
        trail.map(async (row) => ({ at: row._creationTime, action: row.action, by: await nameOf(ctx, row.actor_id), details: row.details })),
      ),
    };
  },
});

const certificateArgs = {
  start: v.string(),
  expires: v.string(),
  file_id: v.id("_storage"),
  file_name: v.string(),
  content_type: v.optional(v.string()),
};

/** The admin adds a policy with its first certificate (Figma F4); verified straight away (decision V4). */
export const adminCreate = mutation({
  args: {
    insurance_type: typeValidator,
    subcontractor_id: v.optional(v.id("subcontractors")),
    insurer: v.string(),
    policy_number: v.optional(v.string()),
    coverage: v.string(),
    responsible_user_id: v.optional(v.id("users")),
    notes: v.optional(v.string()),
    ...certificateArgs,
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const insurer = text(args.insurer, "The insurer");
    if (insurer === undefined) throw new ConvexError("Enter the insurer.");
    const coverage = text(args.coverage, "The coverage");
    if (coverage === undefined) throw new ConvexError("Enter the coverage, e.g. $10,000,000 or Statutory.");
    checkDates(args.start, args.expires);
    if (args.subcontractor_id !== undefined && (await ctx.db.get(args.subcontractor_id)) === null) {
      throw new ConvexError("That subcontractor no longer exists.");
    }
    if ((await ctx.db.system.get(args.file_id)) === null) throw new ConvexError("The certificate didn't finish uploading. Please try again.");

    const duplicate = (
      await ctx.db
        .query("insurance_policies")
        .withIndex("by_subcontractor", (q) => q.eq("subcontractor_id", args.subcontractor_id))
        .collect()
    ).find((policy) => !policy.archived && policy.insurance_type === args.insurance_type);
    if (duplicate) {
      throw new ConvexError(
        `${await entityName(ctx, args.subcontractor_id)} already has a ${INSURANCE_TYPE_LABELS[args.insurance_type]} policy. Open it and upload a renewal instead.`,
      );
    }

    const policyId = await ctx.db.insert("insurance_policies", {
      subcontractor_id: args.subcontractor_id,
      insurance_type: args.insurance_type,
      insurer,
      policy_number: text(args.policy_number, "The policy number"),
      coverage,
      responsible_user_id: args.responsible_user_id,
      notes: text(args.notes, "Notes"),
      archived: false,
    });
    const certificateId = await ctx.db.insert("insurance_certificates", {
      policy_id: policyId,
      start: args.start,
      expires: args.expires,
      file_id: args.file_id,
      file_name: args.file_name,
      content_type: args.content_type,
      uploaded_by: admin._id,
      state: "verified",
      verified_by: admin._id,
      verified_at: Date.now(),
    });
    await audit(ctx, { policy_id: policyId, certificate_id: certificateId, action: "added", actor_id: admin._id });
    return policyId;
  },
});

/** The admin uploads a renewal (Figma SC06); verified straight away (V4), the previous certificate kept. */
export const adminRenew = mutation({
  args: {
    policy_id: v.id("insurance_policies"),
    insurer: v.string(),
    coverage: v.string(),
    responsible_user_id: v.optional(v.id("users")),
    ...certificateArgs,
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const policy = await ctx.db.get(args.policy_id);
    if (policy === null || policy.archived) throw new ConvexError("That policy no longer exists.");
    const insurer = text(args.insurer, "The insurer");
    if (insurer === undefined) throw new ConvexError("Enter the insurer.");
    const coverage = text(args.coverage, "The coverage");
    if (coverage === undefined) throw new ConvexError("Enter the coverage.");
    checkDates(args.start, args.expires);
    if ((await ctx.db.system.get(args.file_id)) === null) throw new ConvexError("The certificate didn't finish uploading. Please try again.");

    await ctx.db.patch(policy._id, {
      insurer,
      coverage,
      ...(args.responsible_user_id !== undefined ? { responsible_user_id: args.responsible_user_id } : {}),
    });
    const certificateId = await ctx.db.insert("insurance_certificates", {
      policy_id: policy._id,
      start: args.start,
      expires: args.expires,
      file_id: args.file_id,
      file_name: args.file_name,
      content_type: args.content_type,
      uploaded_by: admin._id,
      state: "verified",
      verified_by: admin._id,
      verified_at: Date.now(),
    });
    await supersedeOthers(ctx, policy._id, certificateId, admin._id);
    await audit(ctx, { policy_id: policy._id, certificate_id: certificateId, action: "uploaded", actor_id: admin._id, details: `Renewal to ${args.expires}.` });
    await audit(ctx, { policy_id: policy._id, certificate_id: certificateId, action: "verified", actor_id: admin._id });
  },
});

/** Verifies a certificate a subcontractor uploaded (Figma SC07); the admin confirms the expiry. */
export const adminVerify = mutation({
  args: { certificate_id: v.id("insurance_certificates"), expires: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireVerifier(ctx);
    const certificate = await ctx.db.get(args.certificate_id);
    if (certificate === null) throw new ConvexError("That certificate no longer exists.");
    if (certificate.state !== "pending") throw new ConvexError("That certificate has already been checked.");
    checkDates(certificate.start, args.expires);
    await ctx.db.patch(certificate._id, { state: "verified", verified_by: admin._id, verified_at: Date.now(), expires: args.expires });
    await supersedeOthers(ctx, certificate.policy_id, certificate._id, admin._id);
    await audit(ctx, {
      policy_id: certificate.policy_id,
      certificate_id: certificate._id,
      action: "verified",
      actor_id: admin._id,
      details: args.expires !== certificate.expires ? `Expiry confirmed as ${args.expires} (was ${certificate.expires}).` : undefined,
    });
  },
});

/** Sends a subcontractor's certificate back with a reason; the policy shows Action required. */
export const adminReject = mutation({
  args: { certificate_id: v.id("insurance_certificates"), reason: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireVerifier(ctx);
    const reason = args.reason.trim();
    if (reason === "") throw new ConvexError("Enter a reason, so the subcontractor knows what to fix.");
    const certificate = await ctx.db.get(args.certificate_id);
    if (certificate === null) throw new ConvexError("That certificate no longer exists.");
    if (certificate.state !== "pending") throw new ConvexError("That certificate has already been checked.");
    await ctx.db.patch(certificate._id, { state: "rejected", rejected_reason: reason });
    await audit(ctx, { policy_id: certificate.policy_id, certificate_id: certificate._id, action: "rejected", actor_id: admin._id, details: reason });
  },
});

/**
 * The admin corrects a policy's details and its current certificate's dates,
 * with a reason (framework 11, decision AD32). A new certificate is a
 * renewal instead, so the old one is kept.
 */
export const adminEdit = mutation({
  args: {
    policy_id: v.id("insurance_policies"),
    insurer: v.string(),
    policy_number: v.optional(v.string()),
    coverage: v.string(),
    responsible_user_id: v.union(v.id("users"), v.null()),
    notes: v.optional(v.string()),
    start: v.string(),
    expires: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const policy = await ctx.db.get(args.policy_id);
    if (policy === null || policy.archived) throw new ConvexError("That policy no longer exists.");
    const reason = checkReason(args.reason);
    const insurer = text(args.insurer, "The insurer");
    if (insurer === undefined) throw new ConvexError("Enter the insurer.");
    const coverage = text(args.coverage, "The coverage");
    if (coverage === undefined) throw new ConvexError("Enter the coverage, e.g. $10,000,000 or Statutory.");
    checkDates(args.start, args.expires);
    if (args.responsible_user_id !== null && (await ctx.db.get(args.responsible_user_id)) === null) {
      throw new ConvexError("That responsible person no longer exists. Choose someone else.");
    }
    const certificates = await certificatesOf(ctx, policy._id);
    const certificate = [...certificates].reverse().find((row) => row.state === "pending" || row.state === "verified");
    if (certificate === undefined) throw new ConvexError("This policy has no current certificate to correct. Upload a renewal instead.");

    const next = {
      insurer,
      policy_number: text(args.policy_number, "The policy number"),
      coverage,
      responsible_user_id: args.responsible_user_id ?? undefined,
      notes: text(args.notes, "Notes"),
    };
    const details = describeEdit(
      [
        { label: "Insurer", before: policy.insurer, after: next.insurer },
        { label: "Policy number", before: policy.policy_number, after: next.policy_number },
        { label: "Coverage", before: policy.coverage, after: next.coverage },
        { label: "Start date", before: certificate.start, after: args.start, kind: "date" },
        { label: "Expiry date", before: certificate.expires, after: args.expires, kind: "date" },
        {
          label: "Responsible person",
          before: await nameOf(ctx, policy.responsible_user_id),
          after: await nameOf(ctx, next.responsible_user_id),
        },
        { label: "Notes", before: policy.notes, after: next.notes, kind: "long" },
      ],
      reason,
    );
    await ctx.db.patch(policy._id, next);
    await ctx.db.patch(certificate._id, { start: args.start, expires: args.expires });
    await audit(ctx, { policy_id: policy._id, certificate_id: certificate._id, action: "edited", actor_id: admin._id, details });
  },
});

/** The admin archives a policy that is no longer held, with a reason. It is kept, never deleted (framework 11). */
export const adminArchive = mutation({
  args: { policy_id: v.id("insurance_policies"), reason: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const policy = await ctx.db.get(args.policy_id);
    if (policy === null || policy.archived) throw new ConvexError("That policy is already archived.");
    const reason = checkReason(args.reason, "archive");
    await ctx.db.patch(policy._id, { archived: true });
    await audit(ctx, { policy_id: policy._id, action: "archived", actor_id: admin._id, details: reason });
  },
});
