import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { canVerifyEvidence, canViewCompliance, isAdminUser } from "./permissions";
import { internal } from "./_generated/api";
import { businessToday, formatLongDate } from "./whsDates";
import { accreditationLink } from "./whsLinks";
import { checkReason, describeEdit } from "./whsEdits";
import {
  type AccreditationStatus,
  deriveAccreditationStatus,
  dueSoonWindowDays,
} from "./whsStatus";

/**
 * Worker accreditations (WHS framework 4B, 8). Decisions made where the
 * framework is silent are in docs/reference/whs-decisions.md.
 */

type Version = Doc<"whs_record_versions">;

/** The accreditation types a brand new install starts with (framework 4B). Admin-editable afterwards. */
const DEFAULT_TYPES = [
  "White Card",
  "First Aid",
  "RIW Card",
  "PTA Induction",
  "Working at Heights",
  "EWP Licence",
  "ASIC Card",
  "Airport Induction",
  "Driver's Licence",
];

/** Framework 7: accreditations are reminded at 60, 30, 14 and 7 days before expiry. */
export const DEFAULT_REMINDER_DAYS = [60, 30, 14, 7];

/** What the worker needs to act on (decisions S2-S4). Awaiting an admin is not theirs to fix. */
const NEEDS_ATTENTION: AccreditationStatus[] = ["expired", "missing", "action-required", "due-soon"];

/** Most urgent first, for the worker's list. */
const STATUS_RANK: Record<AccreditationStatus, number> = {
  "action-required": 0,
  expired: 1,
  missing: 2,
  "due-soon": 3,
  "awaiting-verification": 4,
  "renewal-in-progress": 5,
  current: 6,
};

const MAX_NUMBER_LENGTH = 100;
const MAX_NOTES_LENGTH = 1000;

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function requireCaller(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError("Please sign in again.");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
    .unique();
  if (user === null) {
    throw new ConvexError("Your account isn't set up yet. Please try again in a moment.");
  }
  return user;
}

/** The accreditation types this person must hold: their subcontractor's list, or Western USI's. */
async function requiredTypeIds(ctx: QueryCtx, user: Doc<"users">) {
  const rows = await ctx.db
    .query("accreditation_requirements")
    .withIndex("by_subcontractor", (q) => q.eq("subcontractor_id", user.subcontractor_id))
    .collect();
  return new Set(rows.map((row) => row.type_id));
}

async function versionsOf(ctx: QueryCtx, recordId: Id<"whs_records">) {
  // The index is ordered by creation time within a record, so this is oldest first.
  return await ctx.db
    .query("whs_record_versions")
    .withIndex("by_record", (q) => q.eq("record_id", recordId))
    .collect();
}

function lastWhere(versions: Version[], state: Version["state"]) {
  return [...versions].reverse().find((version) => version.state === state);
}

/** What one accreditation looks like to its worker. */
function summarise(type: Doc<"accreditation_types">, versions: Version[], today: string) {
  const status = deriveAccreditationStatus(versions, today, dueSoonWindowDays(type.reminder_days));
  const verified = lastWhere(versions, "verified");
  const pending = lastWhere(versions, "pending");
  const latest = versions[versions.length - 1];
  // The upload the worker last sent in, else the one that currently counts.
  const shown = pending ?? verified;

  return {
    type_id: type._id,
    name: type.name,
    status,
    needs_attention: NEEDS_ATTENTION.includes(status),
    rank: STATUS_RANK[status],
    sort_order: type.sort_order,
    number: shown?.number,
    issued: shown?.issued,
    expires: shown?.expires,
    no_expiry: shown?.no_expiry ?? false,
    has_evidence: shown !== undefined,
    verified_at: verified?.verified_at,
    verified_by: verified?.verified_by,
    rejected_reason: status === "action-required" ? latest?.rejected_reason : undefined,
  };
}

/** Every accreditation the signed-in worker must hold or has uploaded, most urgent first. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCaller(ctx);
    const today = businessToday();

    const [types, required, records] = await Promise.all([
      ctx.db.query("accreditation_types").collect(),
      requiredTypeIds(ctx, user),
      ctx.db
        .query("whs_records")
        .withIndex("by_worker", (q) => q.eq("worker_id", user._id))
        .collect(),
    ]);

    const versionsByType = new Map<Id<"accreditation_types">, Version[]>();
    await Promise.all(
      records.map(async (record) => {
        versionsByType.set(record.type_id, await versionsOf(ctx, record._id));
      }),
    );

    const items = types
      .filter((type) => required.has(type._id) || versionsByType.has(type._id))
      .filter((type) => !type.archived || versionsByType.has(type._id))
      .map((type) => summarise(type, versionsByType.get(type._id) ?? [], today));

    // Resolve who verified each one, once.
    const verifierIds = [...new Set(items.flatMap((item) => (item.verified_by ? [item.verified_by] : [])))];
    const verifiers = new Map<Id<"users">, string>();
    for (const id of verifierIds) {
      const verifier = await ctx.db.get(id);
      if (verifier !== null) verifiers.set(id, verifier.name ?? verifier.email);
    }

    return {
      worker_name: user.name ?? user.email,
      items: items
        .map(({ verified_by, ...item }) => ({
          ...item,
          verified_by_name: verified_by === undefined ? undefined : verifiers.get(verified_by),
        }))
        .sort((a, b) => a.rank - b.rank || a.sort_order - b.sort_order),
    };
  },
});

/** One accreditation with its evidence and history, for its detail screen. */
export const detail = query({
  args: { type_id: v.id("accreditation_types") },
  handler: async (ctx, args) => {
    const user = await requireCaller(ctx);
    const type = await ctx.db.get(args.type_id);
    if (type === null) return null;

    const record = await ctx.db
      .query("whs_records")
      .withIndex("by_worker_and_type", (q) => q.eq("worker_id", user._id).eq("type_id", type._id))
      .unique();
    const versions = record === null ? [] : await versionsOf(ctx, record._id);

    const summary = summarise(type, versions, businessToday());
    const verifier = summary.verified_by === undefined ? null : await ctx.db.get(summary.verified_by);

    const shown = lastWhere(versions, "pending") ?? lastWhere(versions, "verified") ?? versions[versions.length - 1];

    return {
      ...summary,
      verified_by: undefined,
      verified_by_name: verifier === null ? undefined : (verifier.name ?? verifier.email),
      evidence:
        shown === undefined
          ? null
          : {
              file_name: shown.file_name,
              content_type: shown.content_type,
              url: await ctx.storage.getUrl(shown.file_id),
            },
    };
  },
});

/** A one-off URL the app uploads a photo or PDF to before calling `submit`. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireCaller(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

async function audit(
  ctx: MutationCtx,
  entry: {
    record_id: Id<"whs_records">;
    version_id: Id<"whs_record_versions">;
    action: "uploaded" | "verified" | "rejected" | "superseded" | "edited";
    actor_id: Id<"users">;
    details?: string;
  },
) {
  await ctx.db.insert("whs_audit", entry);
}

/** Marks a verified version as replaced by a newer one, keeping it as history (framework 8). */
async function supersede(ctx: MutationCtx, version: Version, actorId: Id<"users">, details: string) {
  await ctx.db.patch(version._id, { state: "superseded" });
  await audit(ctx, {
    record_id: version.record_id,
    version_id: version._id,
    action: "superseded",
    actor_id: actorId,
    details,
  });
}

/**
 * A worker's upload of evidence for one of their accreditations: the first one
 * is Awaiting verification, a later one is a renewal (decision S1). An admin's
 * own upload is verified straight away (decision V4) because they are the
 * one who checks it.
 */
export const submit = mutation({
  args: {
    type_id: v.id("accreditation_types"),
    file_id: v.id("_storage"),
    file_name: v.string(),
    content_type: v.optional(v.string()),
    number: v.optional(v.string()),
    issued: v.optional(v.string()),
    expires: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ status: AccreditationStatus }> => {
    const user = await requireCaller(ctx);

    const type = await ctx.db.get(args.type_id);
    if (type === null || type.archived) {
      throw new ConvexError("That accreditation type no longer exists.");
    }

    const existing = await ctx.db
      .query("whs_records")
      .withIndex("by_worker_and_type", (q) => q.eq("worker_id", user._id).eq("type_id", type._id))
      .unique();
    if (existing === null && !(await requiredTypeIds(ctx, user)).has(type._id)) {
      throw new ConvexError(`${type.name} isn't on your required list.`);
    }

    if ((await ctx.db.system.get(args.file_id)) === null) {
      throw new ConvexError("Your file didn't finish uploading. Please try again.");
    }

    const number = args.number?.trim() || undefined;
    if (number !== undefined && number.length > MAX_NUMBER_LENGTH) {
      throw new ConvexError(`The card or licence number can be up to ${MAX_NUMBER_LENGTH} characters.`);
    }
    const notes = args.notes?.trim() || undefined;
    if (notes !== undefined && notes.length > MAX_NOTES_LENGTH) {
      throw new ConvexError(`Notes can be up to ${MAX_NOTES_LENGTH} characters.`);
    }

    const issued = args.issued?.trim() || undefined;
    if (issued !== undefined && !isValidIsoDate(issued)) {
      throw new ConvexError("The issued date isn't a valid date.");
    }
    // A blank expiry means the accreditation doesn't expire (decision S6).
    const expires = args.expires?.trim() || undefined;
    if (expires !== undefined && !isValidIsoDate(expires)) {
      throw new ConvexError("The expiry date isn't a valid date.");
    }
    if (issued !== undefined && expires !== undefined && expires < issued) {
      throw new ConvexError("The expiry date can't be before the issued date.");
    }

    const recordId =
      existing?._id ??
      (await ctx.db.insert("whs_records", {
        category: "accreditation",
        worker_id: user._id,
        type_id: type._id,
        responsible_user_id: user._id,
      }));

    // Re-uploading before the office has looked replaces the earlier upload.
    const previous = await versionsOf(ctx, recordId);
    for (const version of previous.filter((entry) => entry.state === "pending")) {
      await supersede(ctx, version, user._id, "Replaced by a newer upload before it was checked.");
    }

    const autoVerified = isAdminUser(user);
    const versionId = await ctx.db.insert("whs_record_versions", {
      record_id: recordId,
      file_id: args.file_id,
      file_name: args.file_name,
      content_type: args.content_type,
      number,
      issued,
      expires,
      no_expiry: expires === undefined,
      notes,
      uploaded_by: user._id,
      state: autoVerified ? "verified" : "pending",
      verified_by: autoVerified ? user._id : undefined,
      verified_at: autoVerified ? Date.now() : undefined,
    });
    await audit(ctx, { record_id: recordId, version_id: versionId, action: "uploaded", actor_id: user._id });

    if (autoVerified) {
      for (const version of previous.filter((entry) => entry.state === "verified")) {
        await supersede(ctx, version, user._id, `Replaced by a newer verified upload. Previous expiry: ${version.expires ?? "none"}.`);
      }
      await audit(ctx, { record_id: recordId, version_id: versionId, action: "verified", actor_id: user._id });
    }

    const status = deriveAccreditationStatus(
      await versionsOf(ctx, recordId),
      businessToday(),
      dueSoonWindowDays(type.reminder_days),
    );
    return { status };
  },
});

async function pendingVersion(ctx: MutationCtx, versionId: Id<"whs_record_versions">) {
  const version = await ctx.db.get(versionId);
  if (version === null) {
    throw new ConvexError("That upload no longer exists.");
  }
  if (version.state !== "pending") {
    throw new ConvexError("That upload has already been checked.");
  }
  return version;
}

/** Emails the worker the outcome of the office's check (best effort: a failed email never undoes the decision). */
async function notifyWorker(
  ctx: MutationCtx,
  version: Version,
  outcome: { approved: true } | { approved: false; reason: string },
) {
  const record = await ctx.db.get(version.record_id);
  if (record === null) return;
  const [worker, type] = await Promise.all([ctx.db.get(record.worker_id), ctx.db.get(record.type_id)]);
  if (worker === null || type === null) return;

  const name = worker.name ?? worker.email;
  const link = { label: "Open it in the app", url: accreditationLink(type._id) };

  if (outcome.approved) {
    await ctx.scheduler.runAfter(0, internal.email.sendWhsEmail, {
      to: [worker.email],
      subject: `Your ${type.name} has been approved`,
      lines: [
        `Hi ${name},`,
        `The office has checked your ${type.name} and approved it.`,
        version.no_expiry || version.expires === undefined
          ? "It has no expiry date."
          : `It is valid until ${formatLongDate(version.expires)}. We'll remind you before it expires.`,
      ],
      link,
    });
  } else {
    await ctx.scheduler.runAfter(0, internal.email.sendWhsEmail, {
      to: [worker.email],
      subject: `Your ${type.name} needs another look`,
      lines: [
        `Hi ${name},`,
        `The office couldn't approve the ${type.name} you uploaded.`,
        `Reason: ${outcome.reason}`,
        "Please sign in to the Western USI InstallFlow app and upload a corrected copy.",
      ],
      link,
    });
  }
}

/**
 * Verifies a waiting upload. `expires` lets the admin add or correct the
 * expiry date while checking it, e.g. when the worker left it blank
 * (decision S6); the change is recorded in the audit trail.
 */
async function applyVerification(
  ctx: MutationCtx,
  admin: Doc<"users">,
  versionId: Id<"whs_record_versions">,
  expires?: string,
) {
  const pending = await pendingVersion(ctx, versionId);
  const previous = (await versionsOf(ctx, pending.record_id)).filter((entry) => entry.state === "verified");

  const newExpiry = expires?.trim() || undefined;
  if (newExpiry !== undefined) {
    if (!isValidIsoDate(newExpiry)) throw new ConvexError("The expiry date isn't a valid date.");
    if (pending.issued !== undefined && newExpiry < pending.issued) {
      throw new ConvexError("The expiry date can't be before the issued date.");
    }
  }

  await ctx.db.patch(pending._id, {
    state: "verified",
    verified_by: admin._id,
    verified_at: Date.now(),
    ...(newExpiry !== undefined && newExpiry !== pending.expires ? { expires: newExpiry, no_expiry: false } : {}),
  });
  await audit(ctx, {
    record_id: pending.record_id,
    version_id: pending._id,
    action: "verified",
    actor_id: admin._id,
    details:
      newExpiry !== undefined && newExpiry !== pending.expires
        ? `Expiry set to ${newExpiry} while verifying (was ${pending.expires ?? "none"}).`
        : undefined,
  });
  const version = { ...pending, expires: newExpiry ?? pending.expires, no_expiry: newExpiry === undefined ? pending.no_expiry : false };

  // The previous document is archived, never overwritten (framework 8).
  for (const old of previous) {
    await supersede(ctx, old, admin._id, `Replaced by a newer verified upload. Previous expiry: ${old.expires ?? "none"}.`);
  }

  await notifyWorker(ctx, version, { approved: true });
}

async function applyRejection(
  ctx: MutationCtx,
  admin: Doc<"users">,
  versionId: Id<"whs_record_versions">,
  reason: string,
) {
  const trimmed = reason.trim();
  if (trimmed === "") {
    throw new ConvexError("Enter a reason, so the worker knows what to fix.");
  }
  const version = await pendingVersion(ctx, versionId);

  await ctx.db.patch(version._id, { state: "rejected", rejected_reason: trimmed });
  await audit(ctx, {
    record_id: version.record_id,
    version_id: version._id,
    action: "rejected",
    actor_id: admin._id,
    details: trimmed,
  });

  await notifyWorker(ctx, version, { approved: false, reason: trimmed });
}

export async function requireVerifier(ctx: MutationCtx) {
  const user = await requireCaller(ctx);
  if (!canVerifyEvidence(user)) {
    throw new ConvexError("Only admins and management can check evidence.");
  }
  return user;
}

/** Adding or correcting evidence is the admin's alone; management verifies but never uploads (decision AD43). */
async function requireEvidenceAdmin(ctx: MutationCtx) {
  const user = await requireCaller(ctx);
  if (!isAdminUser(user)) throw new ConvexError("Only an administrator can add or change evidence.");
  return user;
}

/** Approves a waiting upload. For the admin dashboard, once it has an accreditations screen. */
export const verify = mutation({
  args: { version_id: v.id("whs_record_versions"), expires: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await applyVerification(ctx, await requireVerifier(ctx), args.version_id, args.expires);
  },
});

/** Sends a waiting upload back with a reason; the worker sees it as Action required. */
export const reject = mutation({
  args: { version_id: v.id("whs_record_versions"), reason: v.string() },
  handler: async (ctx, args) => {
    await applyRejection(ctx, await requireVerifier(ctx), args.version_id, args.reason);
  },
});

export async function adminByEmail(ctx: MutationCtx, email: string) {
  const needle = email.trim().toLowerCase();
  const users = await ctx.db.query("users").collect();
  const admin = users.find((user) => user.email.trim().toLowerCase() === needle);
  if (admin === undefined || !canVerifyEvidence(admin)) {
    throw new ConvexError(`${email} is not an administrator.`);
  }
  return admin;
}

/**
 * Command-line versions of verify/reject, for testing before the admin
 * dashboard has an accreditations screen (the CLI has no signed-in user):
 *   npx convex run accreditations:verifyAs '{"version_id":"…","admin_email":"…"}'
 * Internal, so the app and the dashboard cannot call them.
 */
export const verifyAs = internalMutation({
  args: { version_id: v.id("whs_record_versions"), admin_email: v.string() },
  handler: async (ctx, args) => {
    await applyVerification(ctx, await adminByEmail(ctx, args.admin_email), args.version_id);
  },
});

export const rejectAs = internalMutation({
  args: { version_id: v.id("whs_record_versions"), admin_email: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    await applyRejection(ctx, await adminByEmail(ctx, args.admin_email), args.version_id, args.reason);
  },
});

/** Everything waiting to be checked, oldest first — to find version ids for the commands above. */
export const waiting = internalQuery({
  args: {},
  handler: async (ctx) => {
    const versions = await ctx.db.query("whs_record_versions").collect();
    const pending = versions.filter((version) => version.state === "pending");
    return await Promise.all(
      pending.map(async (version) => {
        const record = await ctx.db.get(version.record_id);
        const worker = record === null ? null : await ctx.db.get(record.worker_id);
        const type = record === null ? null : await ctx.db.get(record.type_id);
        return {
          version_id: version._id,
          worker: worker?.name ?? worker?.email,
          type: type?.name,
          expires: version.expires,
          file: version.file_name,
        };
      }),
    );
  },
});

/**
 * Sets up the starting accreditation types and who must hold them: every type
 * for Western USI's own people and for each subcontractor that has no list yet
 * (decisions R1, R4). Safe to run again — it only fills gaps:
 *   npx convex run accreditations:seedDefaults
 */
export const seedDefaults = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("accreditation_types").collect();
    for (const [index, name] of DEFAULT_TYPES.entries()) {
      if (!existing.some((type) => type.name === name)) {
        await ctx.db.insert("accreditation_types", {
          name,
          reminder_days: DEFAULT_REMINDER_DAYS,
          sort_order: index + 1,
          archived: false,
        });
      }
    }

    const activeTypes = (await ctx.db.query("accreditation_types").collect()).filter((type) => !type.archived);
    const subcontractors = (await ctx.db.query("subcontractors").collect()).filter((row) => !row.archived);
    const owners: (Id<"subcontractors"> | undefined)[] = [undefined, ...subcontractors.map((row) => row._id)];

    let added = 0;
    for (const owner of owners) {
      const rows = await ctx.db
        .query("accreditation_requirements")
        .withIndex("by_subcontractor", (q) => q.eq("subcontractor_id", owner))
        .collect();
      if (rows.length > 0) continue;

      for (const type of activeTypes) {
        await ctx.db.insert("accreditation_requirements", { subcontractor_id: owner, type_id: type._id });
        added++;
      }
    }

    return { types: activeTypes.length, requirements_added: added };
  },
});

// ---------------------------------------------------------------------------
// Admin dashboard: one accreditation, and adding evidence for a worker
// ---------------------------------------------------------------------------

/** Admins and management open the records (decisions V1, AD43). */
async function requirePanelUser(ctx: QueryCtx) {
  const user = await requireCaller(ctx);
  if (!canViewCompliance(user)) {
    throw new ConvexError("Only admins and management can open this.");
  }
  return user;
}

async function nameOf(ctx: QueryCtx, id: Id<"users"> | undefined) {
  if (id === undefined) return undefined;
  const user = await ctx.db.get(id);
  return user === null ? "Unknown" : (user.name ?? user.email);
}

/**
 * One worker's accreditation for the admin's Review Evidence screen. `key` is
 * the register row id: a record id, or `workerId:typeId` for a Missing one.
 */
export const adminDetail = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requirePanelUser(ctx);

    let record: Doc<"whs_records"> | null = null;
    let workerId: Id<"users"> | null = null;
    let typeId: Id<"accreditation_types"> | null = null;
    const recordId = ctx.db.normalizeId("whs_records", args.key);
    if (recordId !== null) {
      record = await ctx.db.get(recordId);
      workerId = record?.worker_id ?? null;
      typeId = record?.type_id ?? null;
    } else {
      const [workerPart, typePart] = args.key.split(":");
      workerId = ctx.db.normalizeId("users", workerPart ?? "");
      typeId = ctx.db.normalizeId("accreditation_types", typePart ?? "");
      if (workerId !== null && typeId !== null) {
        const w = workerId;
        const t = typeId;
        record = await ctx.db
          .query("whs_records")
          .withIndex("by_worker_and_type", (q) => q.eq("worker_id", w).eq("type_id", t))
          .unique();
      }
    }
    if (workerId === null || typeId === null) return null;
    const [worker, type] = await Promise.all([ctx.db.get(workerId), ctx.db.get(typeId)]);
    if (worker === null || type === null) return null;

    const versions = record === null ? [] : await versionsOf(ctx, record._id);
    const status = deriveAccreditationStatus(versions, businessToday(), dueSoonWindowDays(type.reminder_days));
    const pending = lastWhere(versions, "pending");
    const verified = lastWhere(versions, "verified");
    const latest = versions[versions.length - 1];
    const shown = pending ?? verified ?? latest;
    const subcontractor = worker.subcontractor_id === undefined ? null : await ctx.db.get(worker.subcontractor_id);

    const trail =
      record === null
        ? []
        : await ctx.db
            .query("whs_audit")
            .withIndex("by_record", (q) => q.eq("record_id", record._id))
            .order("desc")
            .take(20);

    return {
      key: args.key,
      record_id: record?._id,
      worker_id: worker._id,
      type_id: type._id,
      worker: worker.name ?? worker.email,
      entity: subcontractor?.name ?? "Western USI",
      type: type.name,
      status,
      can_verify: canVerifyEvidence(viewer),
      reminder_days: type.reminder_days,
      evidence:
        shown === undefined
          ? null
          : {
              version_id: shown._id,
              state: shown.state,
              file_name: shown.file_name,
              url: await ctx.storage.getUrl(shown.file_id),
              number: shown.number,
              issued: shown.issued,
              expires: shown.expires,
              no_expiry: shown.no_expiry,
              notes: shown.notes,
              uploaded_by: await nameOf(ctx, shown.uploaded_by),
              uploaded_at: shown._creationTime,
              verified_by: await nameOf(ctx, shown.verified_by),
              verified_at: shown.verified_at,
              rejected_reason: shown.state === "rejected" ? shown.rejected_reason : undefined,
            },
      pending_version_id: pending?._id,
      activity: await Promise.all(
        trail.map(async (row) => ({
          at: row._creationTime,
          action: row.action,
          by: await nameOf(ctx, row.actor_id),
          details: row.details,
        })),
      ),
    };
  },
});

/**
 * The admin adds evidence for a worker (backlog "add evidence for a worker").
 * Recorded as verified by them straight away (decision V4); earlier waiting
 * uploads and the previous verified one are superseded, never deleted.
 */
export const adminAddEvidence = mutation({
  args: {
    worker_id: v.id("users"),
    /** An existing type, or `new_type_name` for one that isn't in the list (decision AD40). */
    type_id: v.optional(v.id("accreditation_types")),
    new_type_name: v.optional(v.string()),
    file_id: v.id("_storage"),
    file_name: v.string(),
    content_type: v.optional(v.string()),
    number: v.optional(v.string()),
    issued: v.optional(v.string()),
    expires: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireEvidenceAdmin(ctx);
    const worker = await ctx.db.get(args.worker_id);
    if (worker === null) throw new ConvexError("That worker no longer exists.");
    const newTypeName = args.new_type_name?.trim().replace(/\s+/g, " ");
    if (args.type_id === undefined && !newTypeName) throw new ConvexError("Select the accreditation type, or choose Other and type its name.");
    if (args.type_id !== undefined && newTypeName) throw new ConvexError("Choose either an accreditation type from the list, or Other.");
    let type: Doc<"accreditation_types"> | null = null;
    if (args.type_id !== undefined) {
      type = await ctx.db.get(args.type_id);
      if (type === null || type.archived) throw new ConvexError("That accreditation type no longer exists.");
    }
    if (newTypeName !== undefined && newTypeName.length > 80) throw new ConvexError("The accreditation name can be up to 80 characters.");
    if ((await ctx.db.system.get(args.file_id)) === null) {
      throw new ConvexError("The file didn't finish uploading. Please try again.");
    }

    const number = args.number?.trim() || undefined;
    if (number !== undefined && number.length > MAX_NUMBER_LENGTH) {
      throw new ConvexError(`The card or licence number can be up to ${MAX_NUMBER_LENGTH} characters.`);
    }
    const notes = args.notes?.trim() || undefined;
    if (notes !== undefined && notes.length > MAX_NOTES_LENGTH) {
      throw new ConvexError(`Notes can be up to ${MAX_NOTES_LENGTH} characters.`);
    }
    const issued = args.issued?.trim() || undefined;
    if (issued !== undefined && !isValidIsoDate(issued)) throw new ConvexError("The issued date isn't a valid date.");
    const expires = args.expires?.trim() || undefined;
    if (expires !== undefined && !isValidIsoDate(expires)) throw new ConvexError("The expiry date isn't a valid date.");
    if (issued !== undefined && expires !== undefined && expires < issued) {
      throw new ConvexError("The expiry date can't be before the issued date.");
    }

    // A type typed in under "Other" is created now and required of no one: only this worker holds it (decision AD40).
    if (type === null && newTypeName) {
      const all = await ctx.db.query("accreditation_types").collect();
      if (all.some((entry) => !entry.archived && entry.name.toLowerCase() === newTypeName.toLowerCase())) {
        throw new ConvexError(`There is already an accreditation called "${newTypeName}". Choose it from the list instead.`);
      }
      const typeId = await ctx.db.insert("accreditation_types", {
        name: newTypeName,
        reminder_days: DEFAULT_REMINDER_DAYS,
        sort_order: all.reduce((max, entry) => Math.max(max, entry.sort_order), 0) + 1,
        archived: false,
      });
      type = await ctx.db.get(typeId);
    }
    if (type === null) throw new ConvexError("Select the accreditation type.");
    const heldType = type;

    const existing = await ctx.db
      .query("whs_records")
      .withIndex("by_worker_and_type", (q) => q.eq("worker_id", worker._id).eq("type_id", heldType._id))
      .unique();
    const recordId =
      existing?._id ??
      (await ctx.db.insert("whs_records", {
        category: "accreditation",
        worker_id: worker._id,
        type_id: heldType._id,
        responsible_user_id: worker._id,
      }));

    const previous = await versionsOf(ctx, recordId);
    for (const version of previous.filter((entry) => entry.state === "pending")) {
      await supersede(ctx, version, admin._id, "Replaced by evidence the office added.");
    }
    for (const version of previous.filter((entry) => entry.state === "verified")) {
      await supersede(ctx, version, admin._id, `Replaced by a newer verified upload. Previous expiry: ${version.expires ?? "none"}.`);
    }

    const versionId = await ctx.db.insert("whs_record_versions", {
      record_id: recordId,
      file_id: args.file_id,
      file_name: args.file_name,
      content_type: args.content_type,
      number,
      issued,
      expires,
      no_expiry: expires === undefined,
      notes,
      uploaded_by: admin._id,
      state: "verified",
      verified_by: admin._id,
      verified_at: Date.now(),
    });
    await audit(ctx, { record_id: recordId, version_id: versionId, action: "uploaded", actor_id: admin._id, details: `Added by the office for ${worker.name ?? worker.email}.` });
    await audit(ctx, { record_id: recordId, version_id: versionId, action: "verified", actor_id: admin._id });
    return { record_id: recordId };
  },
});

/** Active accreditation types, for the admin's "Add Worker Accreditation" form. */
export const types = query({
  args: {},
  handler: async (ctx) => {
    await requirePanelUser(ctx);
    return (await ctx.db.query("accreditation_types").collect())
      .filter((type) => !type.archived)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((type) => ({ id: type._id, name: type.name }));
  },
});

/**
 * The admin corrects the verified evidence's details (card number, dates,
 * notes) with a reason (framework 11, decision AD32). Waiting evidence is
 * corrected while verifying it (S6); new evidence is a new upload.
 */
export const adminEdit = mutation({
  args: {
    record_id: v.id("whs_records"),
    number: v.optional(v.string()),
    issued: v.optional(v.string()),
    expires: v.optional(v.string()),
    no_expiry: v.boolean(),
    notes: v.optional(v.string()),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireEvidenceAdmin(ctx);
    const record = await ctx.db.get(args.record_id);
    if (record === null) throw new ConvexError("That accreditation no longer exists.");
    const versions = await versionsOf(ctx, record._id);
    const verified = lastWhere(versions, "verified");
    if (verified === undefined) throw new ConvexError("There's no verified evidence to correct yet. Verify or add evidence first.");
    const reason = checkReason(args.reason);
    if (args.issued !== undefined && args.issued !== "" && !isValidIsoDate(args.issued)) throw new ConvexError("Select a valid issue date.");
    const expires = args.no_expiry ? undefined : args.expires || undefined;
    if (!args.no_expiry) {
      if (expires === undefined) throw new ConvexError("Select the expiry date, or tick that it doesn't expire.");
      if (!isValidIsoDate(expires)) throw new ConvexError("Select a valid expiry date.");
    }
    const issued = args.issued || undefined;
    if (issued !== undefined && expires !== undefined && expires <= issued) throw new ConvexError("The expiry date must be after the issue date.");
    const number = args.number?.trim() || undefined;
    if (number !== undefined && number.length > 100) throw new ConvexError("The card number can be up to 100 characters.");
    const notes = args.notes?.trim() || undefined;
    if (notes !== undefined && notes.length > 1000) throw new ConvexError("Notes can be up to 1000 characters.");

    const details = describeEdit(
      [
        { label: "Card number", before: verified.number, after: number },
        { label: "Issue date", before: verified.issued, after: issued, kind: "date" },
        { label: "Expiry date", before: verified.no_expiry ? "No expiry" : verified.expires, after: args.no_expiry ? "No expiry" : expires, kind: "date" },
        { label: "Notes", before: verified.notes, after: notes, kind: "long" },
      ],
      reason,
    );
    await ctx.db.patch(verified._id, { number, issued, expires, no_expiry: args.no_expiry, notes });
    await audit(ctx, { record_id: record._id, version_id: verified._id, action: "edited", actor_id: admin._id, details });
  },
});

/**
 * One worker's accreditations for the management worker page (Figma M6,
 * decision AD43): every one they must hold or have uploaded, most urgent
 * first, each with its register key so it opens its record. Read-only.
 */
export const forWorker = query({
  args: { worker_id: v.string() },
  handler: async (ctx, args) => {
    await requirePanelUser(ctx);
    const workerId = ctx.db.normalizeId("users", args.worker_id);
    const worker = workerId === null ? null : await ctx.db.get(workerId);
    if (worker === null) return null;
    const today = businessToday();
    const [types, required, records] = await Promise.all([
      ctx.db.query("accreditation_types").collect(),
      requiredTypeIds(ctx, worker),
      ctx.db
        .query("whs_records")
        .withIndex("by_worker", (q) => q.eq("worker_id", worker._id))
        .collect(),
    ]);
    const recordByType = new Map(records.map((record) => [record.type_id, record]));
    const versionsByType = new Map<Id<"accreditation_types">, Version[]>();
    for (const record of records) versionsByType.set(record.type_id, await versionsOf(ctx, record._id));
    const subcontractor = worker.subcontractor_id === undefined ? null : await ctx.db.get(worker.subcontractor_id);

    const items = types
      .filter((type) => required.has(type._id) || versionsByType.has(type._id))
      .filter((type) => !type.archived || versionsByType.has(type._id))
      .map((type) => ({
        ...summarise(type, versionsByType.get(type._id) ?? [], today),
        key: recordByType.get(type._id)?._id ?? `${worker._id}:${type._id}`,
        required: required.has(type._id),
      }))
      .sort((a, b) => a.rank - b.rank || a.sort_order - b.sort_order);

    return {
      worker: worker.name ?? worker.email,
      entity: subcontractor?.name ?? "Western USI",
      items: items.map(({ verified_by: _verifiedBy, ...item }) => item),
    };
  },
});
