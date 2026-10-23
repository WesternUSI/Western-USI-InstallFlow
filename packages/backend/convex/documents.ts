import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { adminByEmail, isValidIsoDate, requireCaller, requireVerifier } from "./accreditations";
import { enabledRecipientEmails } from "./emails";
import { canSeeDocument, canViewCompliance, documentIsFor, isAdminUser, mustAcknowledgeDocuments } from "./permissions";
import { checkReason, describeEdit } from "./whsEdits";
import { formatLongDate } from "./whsDates";
import { documentLink } from "./whsLinks";

/**
 * Safety documents: SWMS, SDS and other safety documents (WHS framework 4A),
 * with signed acknowledgements (decision D1), concerns (D2) and on-site SWMS
 * changes (D3). Decisions are in docs/reference/whs-decisions.md.
 */

type Kind = Doc<"whs_documents">["kind"];
type Version = Doc<"whs_document_versions">;
type Signature = Doc<"whs_signatures">;

/** The risk codes of the client's SWMS matrix: likelihood 1-4, consequence A-D. */
export const RISK_CODES = ["1", "2", "3", "4"].flatMap((row) => ["A", "B", "C", "D"].map((col) => `${row}${col}`));

const MAX_TEXT = 1000;
const MAX_SHORT_TEXT = 200;
const MAX_PHOTOS = 6;
const MAX_SIGNATURE_PATHS = 200;
const MAX_SIGNATURE_LENGTH = 100_000;

const signatureValidator = v.object({ paths: v.array(v.string()), width: v.number(), height: v.number() });

async function versionsOf(ctx: QueryCtx, documentId: Id<"whs_documents">) {
  // Oldest first: the index is ordered by creation time within a document.
  return await ctx.db
    .query("whs_document_versions")
    .withIndex("by_document", (q) => q.eq("document_id", documentId))
    .collect();
}

function currentOf(versions: Version[]) {
  return [...versions].reverse().find((version) => version.state === "current");
}

async function myAcknowledgement(ctx: QueryCtx, versionId: Id<"whs_document_versions">, userId: Id<"users">) {
  return await ctx.db
    .query("whs_acknowledgements")
    .withIndex("by_version_and_worker", (q) => q.eq("version_id", versionId).eq("worker_id", userId))
    .unique();
}

async function savedSignature(ctx: QueryCtx, userId: Id<"users">): Promise<Signature | null> {
  return await ctx.db
    .query("whs_signatures")
    .withIndex("by_user", (q) => q.eq("user_id", userId))
    .unique();
}

/**
 * What one document looks like to the signed-in worker. A document that needs
 * acknowledging is "Action required" until they sign the current version, then
 * "Current" (decision D5). One that needs no acknowledgement has no status.
 */
async function summarise(ctx: QueryCtx, user: Doc<"users">, document: Doc<"whs_documents">) {
  const versions = await versionsOf(ctx, document._id);
  const current = currentOf(versions);
  if (current === undefined) return null;

  const asked = document.acknowledgement_required && mustAcknowledgeDocuments(user) && documentIsFor(document, user);
  const acknowledgement = asked ? await myAcknowledgement(ctx, current._id, user._id) : null;
  const previous = [...versions].reverse().find((version) => version._id !== current._id);

  return {
    id: document._id,
    kind: document.kind,
    title: document.title,
    code: document.code,
    category: document.category,
    applies_to: document.applies_to,
    version_id: current._id,
    version: current.version,
    issued: current.issued,
    review_date: current.review_date,
    supersedes: previous?.version,
    acknowledgement_required: document.acknowledgement_required,
    status: !asked ? undefined : acknowledgement === null ? ("action-required" as const) : ("current" as const),
    needs_acknowledgement: asked && acknowledgement === null,
    acknowledged_at: acknowledgement?._creationTime,
  };
}

/** Every document meant for the signed-in worker (decision AD33), titles A-Z. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCaller(ctx);
    const documents = (await ctx.db.query("whs_documents").collect()).filter(
      (document) => !document.archived && canSeeDocument(document, user),
    );
    const items = await Promise.all(documents.map((document) => summarise(ctx, user, document)));
    return items
      .flatMap((item) => (item === null ? [] : [item]))
      .sort((a, b) => a.title.localeCompare(b.title));
  },
});

async function userName(ctx: QueryCtx, id: Id<"users">) {
  const user = await ctx.db.get(id);
  return user === null ? "Unknown" : (user.name ?? user.email);
}

/** One document with its file and, for a SWMS, the on-site changes recorded against its current version. */
export const detail = query({
  args: { document_id: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCaller(ctx);
    const documentId = ctx.db.normalizeId("whs_documents", args.document_id);
    const document = documentId === null ? null : await ctx.db.get(documentId);
    if (document === null || document.archived || !canSeeDocument(document, user)) return null;

    const summary = await summarise(ctx, user, document);
    if (summary === null) return null;
    const current = await ctx.db.get(summary.version_id);
    if (current === null) return null;

    const changes =
      document.kind !== "swms"
        ? []
        : await Promise.all(
            (
              await ctx.db
                .query("swms_changes")
                .withIndex("by_version", (q) => q.eq("version_id", current._id))
                .collect()
            )
              .reverse()
              .map(async (change) => ({
                id: change._id,
                change: change.change,
                date: change.date,
                time: change.time,
                state: change.state,
                reported_by_name: await userName(ctx, change.reported_by),
                signed_by_me:
                  (await ctx.db
                    .query("swms_change_signoffs")
                    .withIndex("by_change_and_worker", (q) => q.eq("change_id", change._id).eq("worker_id", user._id))
                    .unique()) !== null,
              })),
          );

    return {
      ...summary,
      notes: document.notes,
      file: {
        name: current.file_name,
        content_type: current.content_type,
        url: await ctx.storage.getUrl(current.file_id),
      },
      changes,
    };
  },
});

// ---------------------------------------------------------------------------
// Signatures and acknowledgements (decision D1)
// ---------------------------------------------------------------------------

/** The signed-in worker's saved signature, or null if they haven't drawn one. */
export const mySignature = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCaller(ctx);
    const signature = await savedSignature(ctx, user._id);
    return signature === null ? null : { paths: signature.paths, width: signature.width, height: signature.height };
  },
});

/** Saves (or replaces) the worker's signature. Past acknowledgements keep the one they were signed with. */
export const saveSignature = mutation({
  args: signatureValidator,
  handler: async (ctx, args) => {
    const user = await requireCaller(ctx);

    const paths = args.paths.filter((path) => path.trim() !== "");
    if (paths.length === 0) {
      throw new ConvexError("Draw your signature in the box first.");
    }
    if (paths.length > MAX_SIGNATURE_PATHS || paths.join("").length > MAX_SIGNATURE_LENGTH) {
      throw new ConvexError("That signature is too detailed to save. Clear it and sign again.");
    }
    if (!(args.width > 0) || !(args.height > 0)) {
      throw new ConvexError("Draw your signature in the box first.");
    }

    const existing = await savedSignature(ctx, user._id);
    if (existing === null) {
      await ctx.db.insert("whs_signatures", { user_id: user._id, paths, width: args.width, height: args.height });
    } else {
      await ctx.db.patch(existing._id, { paths, width: args.width, height: args.height });
    }
  },
});

async function requireSignature(ctx: QueryCtx, userId: Id<"users">) {
  const signature = await savedSignature(ctx, userId);
  if (signature === null) {
    throw new ConvexError("Draw and save your signature first.");
  }
  return { paths: signature.paths, width: signature.width, height: signature.height };
}

/** The worker signs to say they have read and understood this version (framework 4A, decision D1). */
export const acknowledge = mutation({
  args: { version_id: v.id("whs_document_versions") },
  handler: async (ctx, args) => {
    const user = await requireCaller(ctx);

    const version = await ctx.db.get(args.version_id);
    const document = version === null ? null : await ctx.db.get(version.document_id);
    if (version === null || document === null || document.archived) {
      throw new ConvexError("That document no longer exists.");
    }
    if (version.state !== "current") {
      throw new ConvexError("A newer version of this document has been issued. Go back and open it again.");
    }
    if (!document.acknowledgement_required) {
      throw new ConvexError("This document doesn't need acknowledging.");
    }
    if (!mustAcknowledgeDocuments(user)) {
      throw new ConvexError("Only installers acknowledge documents.");
    }
    if (!documentIsFor(document, user)) {
      throw new ConvexError("This document isn't one you need to sign.");
    }
    if ((await myAcknowledgement(ctx, version._id, user._id)) !== null) {
      throw new ConvexError(`You've already acknowledged ${version.version}.`);
    }

    const signature = await requireSignature(ctx, user._id);
    await ctx.db.insert("whs_acknowledgements", {
      document_id: document._id,
      version_id: version._id,
      worker_id: user._id,
      signature,
    });
    await ctx.db.insert("whs_document_audit", {
      document_id: document._id,
      version_id: version._id,
      action: "acknowledged",
      actor_id: user._id,
      details: `Acknowledged and signed ${version.version}.`,
    });
  },
});

// ---------------------------------------------------------------------------
// Raise Concern or Question (decision D2)
// ---------------------------------------------------------------------------

/** Stores the worker's concern or question and emails the office. */
export const raiseConcern = mutation({
  args: { document_id: v.id("whs_documents"), message: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCaller(ctx);

    const message = args.message.trim();
    if (message === "") {
      throw new ConvexError("Write your concern or question first.");
    }
    if (message.length > MAX_TEXT) {
      throw new ConvexError(`Your message can be up to ${MAX_TEXT} characters.`);
    }

    const document = await ctx.db.get(args.document_id);
    if (document === null || document.archived || !canSeeDocument(document, user)) {
      throw new ConvexError("That document no longer exists.");
    }
    const current = currentOf(await versionsOf(ctx, document._id));
    if (current === undefined) {
      throw new ConvexError("That document no longer exists.");
    }

    await ctx.db.insert("whs_concerns", {
      document_id: document._id,
      version_id: current._id,
      worker_id: user._id,
      message,
    });
    await ctx.db.insert("whs_document_audit", {
      document_id: document._id,
      version_id: current._id,
      action: "concern_raised",
      actor_id: user._id,
      details: message,
    });

    const to = await enabledRecipientEmails(ctx);
    if (to.length > 0) {
      const name = user.name ?? user.email;
      await ctx.scheduler.runAfter(0, internal.email.sendWhsEmail, {
        to,
        subject: `${name} raised a concern about ${document.title}`,
        lines: [
          `${name} (${user.email}) raised a concern or question about ${document.title} (${current.version}):`,
          message,
          "Please follow up with them.",
        ],
      });
    }
  },
});

// ---------------------------------------------------------------------------
// On-site changes to a SWMS (decision D3)
// ---------------------------------------------------------------------------

/** A one-off URL the app uploads an on-site change photo to. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireCaller(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

function required(value: string, message: string, max = MAX_TEXT): string {
  const trimmed = value.trim();
  if (trimmed === "") throw new ConvexError(message);
  if (trimmed.length > max) throw new ConvexError(`${message.replace(/\.$/, "")} (up to ${max} characters).`);
  return trimmed;
}

function optional(value: string | undefined, label: string, max = MAX_TEXT): string | undefined {
  const trimmed = value?.trim() || undefined;
  if (trimmed !== undefined && trimmed.length > max) {
    throw new ConvexError(`${label} can be up to ${max} characters.`);
  }
  return trimmed;
}

/**
 * Records an on-site change against the current version of a SWMS, signed by
 * the reporter with their saved signature in the same step. Work is not held
 * up: it starts Awaiting review and the admin is emailed to validate it. Every
 * other affected worker then signs it in their own app.
 */
export const reportChange = mutation({
  args: {
    document_id: v.id("whs_documents"),
    date: v.string(),
    time: v.string(),
    change: v.string(),
    risk_before: v.string(),
    control: v.string(),
    risk_after: v.string(),
    approved_by: v.string(),
    trigger: v.optional(v.string()),
    site: v.optional(v.string()),
    photos: v.array(v.id("_storage")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ change_id: Id<"swms_changes"> }> => {
    const user = await requireCaller(ctx);

    const document = await ctx.db.get(args.document_id);
    if (document === null || document.archived || document.kind !== "swms" || !canSeeDocument(document, user)) {
      throw new ConvexError("That SWMS no longer exists.");
    }
    const current = currentOf(await versionsOf(ctx, document._id));
    if (current === undefined) {
      throw new ConvexError("That SWMS no longer exists.");
    }

    if (!isValidIsoDate(args.date.trim())) {
      throw new ConvexError("Select the date of the change.");
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(args.time.trim())) {
      throw new ConvexError("Enter the time of the change as hh:mm, e.g. 14:30.");
    }
    const change = required(args.change, "Describe the change or new hazard.");
    if (!RISK_CODES.includes(args.risk_before)) {
      throw new ConvexError("Select the risk rating before the new control.");
    }
    const control = required(args.control, "Describe the additional control or revised method.");
    if (!RISK_CODES.includes(args.risk_after)) {
      throw new ConvexError("Select the risk rating after the new control.");
    }
    const approvedBy = required(args.approved_by, "Enter who approved or briefed the change.", MAX_SHORT_TEXT);
    const trigger = optional(args.trigger, "What triggered the change", MAX_SHORT_TEXT);
    const site = optional(args.site, "Site", MAX_SHORT_TEXT);
    const notes = optional(args.notes, "Notes");

    if (args.photos.length > MAX_PHOTOS) {
      throw new ConvexError(`You can add up to ${MAX_PHOTOS} photos.`);
    }
    for (const photo of args.photos) {
      if ((await ctx.db.system.get(photo)) === null) {
        throw new ConvexError("A photo didn't finish uploading. Please try again.");
      }
    }
    const signature = await requireSignature(ctx, user._id);

    const changeId = await ctx.db.insert("swms_changes", {
      document_id: document._id,
      version_id: current._id,
      reported_by: user._id,
      date: args.date.trim(),
      time: args.time.trim(),
      change,
      risk_before: args.risk_before,
      control,
      risk_after: args.risk_after,
      approved_by: approvedBy,
      trigger,
      site,
      photos: args.photos,
      notes,
      state: "awaiting-review",
    });
    await ctx.db.insert("whs_document_audit", {
      document_id: document._id,
      version_id: current._id,
      change_id: changeId,
      action: "change_reported",
      actor_id: user._id,
      details: change,
    });
    await ctx.db.insert("swms_change_signoffs", { change_id: changeId, worker_id: user._id, signature });
    await ctx.db.insert("whs_document_audit", {
      document_id: document._id,
      version_id: current._id,
      change_id: changeId,
      action: "change_signed",
      actor_id: user._id,
    });

    const to = await enabledRecipientEmails(ctx);
    if (to.length > 0) {
      const name = user.name ?? user.email;
      await ctx.scheduler.runAfter(0, internal.email.sendWhsEmail, {
        to,
        subject: `On-site change to ${document.title}: please review`,
        lines: [
          `${name} recorded an on-site change to ${document.title} (${current.version}) on ${formatLongDate(args.date.trim())} at ${args.time.trim()}${site === undefined ? "" : `, at ${site}`}.`,
          `Change or new hazard: ${change}`,
          `Risk before: ${args.risk_before}. Additional control or revised method: ${control}. Risk after: ${args.risk_after}.`,
          `Approved or briefed by: ${approvedBy}.`,
          ...(trigger === undefined ? [] : [`What triggered it: ${trigger}`]),
          ...(notes === undefined ? [] : [`Notes: ${notes}`]),
          "Work has continued under the revised control. Please validate it, or send it back with a reason.",
        ],
      });
    }

    return { change_id: changeId };
  },
});

/** One on-site change with who has signed it, for its detail screen. */
export const changeDetail = query({
  args: { change_id: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCaller(ctx);
    const changeId = ctx.db.normalizeId("swms_changes", args.change_id);
    const change = changeId === null ? null : await ctx.db.get(changeId);
    if (change === null) return null;

    const [document, version] = await Promise.all([ctx.db.get(change.document_id), ctx.db.get(change.version_id)]);
    const signoffs = await ctx.db
      .query("swms_change_signoffs")
      .withIndex("by_change", (q) => q.eq("change_id", change._id))
      .collect();

    return {
      id: change._id,
      document_title: document?.title ?? "SWMS",
      version: version?.version,
      version_is_current: version?.state === "current",
      date: change.date,
      time: change.time,
      change: change.change,
      risk_before: change.risk_before,
      control: change.control,
      risk_after: change.risk_after,
      approved_by: change.approved_by,
      trigger: change.trigger,
      site: change.site,
      notes: change.notes,
      photos: (await Promise.all(change.photos.map((photo) => ctx.storage.getUrl(photo)))).flatMap((url) =>
        url === null ? [] : [url],
      ),
      state: change.state,
      review_reason: change.review_reason,
      reported_by_name: await userName(ctx, change.reported_by),
      signed_by_me: signoffs.some((signoff) => signoff.worker_id === user._id),
      signoffs: await Promise.all(
        signoffs.map(async (signoff) => ({
          name: await userName(ctx, signoff.worker_id),
          signed_at: signoff._creationTime,
        })),
      ),
    };
  },
});

/** An affected worker signs that they have been briefed on the change (the SWMS's "worker initials"). */
export const signChange = mutation({
  args: { change_id: v.id("swms_changes") },
  handler: async (ctx, args) => {
    const user = await requireCaller(ctx);
    const change = await ctx.db.get(args.change_id);
    const changeDocument = change === null ? null : await ctx.db.get(change.document_id);
    if (change === null || changeDocument === null || !canSeeDocument(changeDocument, user)) {
      throw new ConvexError("That on-site change no longer exists.");
    }
    const existing = await ctx.db
      .query("swms_change_signoffs")
      .withIndex("by_change_and_worker", (q) => q.eq("change_id", change._id).eq("worker_id", user._id))
      .unique();
    if (existing !== null) {
      throw new ConvexError("You've already signed this change.");
    }

    const signature = await requireSignature(ctx, user._id);
    await ctx.db.insert("swms_change_signoffs", { change_id: change._id, worker_id: user._id, signature });
    await ctx.db.insert("whs_document_audit", {
      document_id: change.document_id,
      version_id: change.version_id,
      change_id: change._id,
      action: "change_signed",
      actor_id: user._id,
    });
  },
});

async function awaitingChange(ctx: MutationCtx, changeId: Id<"swms_changes">) {
  const change = await ctx.db.get(changeId);
  if (change === null) {
    throw new ConvexError("That on-site change no longer exists.");
  }
  if (change.state !== "awaiting-review") {
    throw new ConvexError("That on-site change has already been reviewed.");
  }
  return change;
}

async function applyValidation(ctx: MutationCtx, admin: Doc<"users">, changeId: Id<"swms_changes">) {
  const change = await awaitingChange(ctx, changeId);
  await ctx.db.patch(change._id, { state: "validated", reviewed_by: admin._id, reviewed_at: Date.now() });
  await ctx.db.insert("whs_document_audit", {
    document_id: change.document_id,
    version_id: change.version_id,
    change_id: change._id,
    action: "change_validated",
    actor_id: admin._id,
  });
}

async function applySendBack(ctx: MutationCtx, admin: Doc<"users">, changeId: Id<"swms_changes">, reason: string) {
  const trimmed = reason.trim();
  if (trimmed === "") {
    throw new ConvexError("Enter a reason, so the worker knows what to change.");
  }
  const change = await awaitingChange(ctx, changeId);
  await ctx.db.patch(change._id, {
    state: "sent-back",
    reviewed_by: admin._id,
    reviewed_at: Date.now(),
    review_reason: trimmed,
  });
  await ctx.db.insert("whs_document_audit", {
    document_id: change.document_id,
    version_id: change.version_id,
    change_id: change._id,
    action: "change_sent_back",
    actor_id: admin._id,
    details: trimmed,
  });

  // The reporter needs to act, so they are told (best effort).
  const [reporter, document] = await Promise.all([ctx.db.get(change.reported_by), ctx.db.get(change.document_id)]);
  if (reporter !== null && document !== null) {
    await ctx.scheduler.runAfter(0, internal.email.sendWhsEmail, {
      to: [reporter.email],
      subject: `Your on-site change to ${document.title} was sent back`,
      lines: [
        `Hi ${reporter.name ?? reporter.email},`,
        `The office reviewed the on-site change you recorded on ${formatLongDate(change.date)} (${change.change}) and sent it back.`,
        `Reason: ${trimmed}`,
        "Please review the controls on site and record the change again in the Western USI InstallFlow app.",
      ],
      link: { label: "Open the SWMS in the app", url: documentLink(document._id) },
    });
  }
}

/** The admin validates an on-site change. For the admin dashboard, once it has a SWMS screen. */
export const validateChange = mutation({
  args: { change_id: v.id("swms_changes") },
  handler: async (ctx, args) => {
    await applyValidation(ctx, await requireVerifier(ctx), args.change_id);
  },
});

/** The admin sends an on-site change back with a reason. */
export const sendBackChange = mutation({
  args: { change_id: v.id("swms_changes"), reason: v.string() },
  handler: async (ctx, args) => {
    await applySendBack(ctx, await requireVerifier(ctx), args.change_id, args.reason);
  },
});

/**
 * Command-line versions, for testing before the admin dashboard has a SWMS screen:
 *   npx convex run documents:validateChangeAs '{"change_id":"…","admin_email":"…"}'
 */
export const validateChangeAs = internalMutation({
  args: { change_id: v.id("swms_changes"), admin_email: v.string() },
  handler: async (ctx, args) => {
    await applyValidation(ctx, await adminByEmail(ctx, args.admin_email), args.change_id);
  },
});

export const sendBackChangeAs = internalMutation({
  args: { change_id: v.id("swms_changes"), admin_email: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    await applySendBack(ctx, await adminByEmail(ctx, args.admin_email), args.change_id, args.reason);
  },
});

/** On-site changes waiting for the admin, oldest first, to find ids for the commands above. */
export const waitingChanges = internalQuery({
  args: {},
  handler: async (ctx) => {
    const changes = await ctx.db
      .query("swms_changes")
      .withIndex("by_state", (q) => q.eq("state", "awaiting-review"))
      .collect();
    return await Promise.all(
      changes.map(async (change) => ({
        change_id: change._id,
        swms: (await ctx.db.get(change.document_id))?.title,
        reported_by: await userName(ctx, change.reported_by),
        change: change.change,
      })),
    );
  },
});

// ---------------------------------------------------------------------------
// Issuing documents and versions (admin screens come later)
// ---------------------------------------------------------------------------

const kindValidator = v.union(v.literal("swms"), v.literal("sds"), v.literal("document"));

/**
 * Issues a version: the previous current one becomes Superseded (framework 4A)
 * and, if acknowledgement is required, everyone is asked to acknowledge again.
 */
interface IssueArgs {
  document_id: Id<"whs_documents">;
  version: string;
  issued: string;
  review_date?: string;
  file_id: Id<"_storage">;
  file_name: string;
  content_type?: string;
  uploaded_by?: Id<"users">;
  change_summary?: string;
}

/** Issues a version and supersedes the current one (framework 4A). Shared by the CLI and the admin screens. */
async function issue(ctx: MutationCtx, args: IssueArgs) {
  const document = await ctx.db.get(args.document_id);
  if (document === null) throw new ConvexError("That document no longer exists.");
  const version = args.version.trim();
  if (version === "") throw new ConvexError("Enter the version number, e.g. v2.1.");
  if (version.length > MAX_SHORT_TEXT) throw new ConvexError(`The version can be up to ${MAX_SHORT_TEXT} characters.`);
  if (!isValidIsoDate(args.issued)) throw new ConvexError("Select a valid issue date.");
  if (args.review_date !== undefined) {
    if (!isValidIsoDate(args.review_date)) throw new ConvexError("Select a valid review date.");
    if (args.review_date <= args.issued) throw new ConvexError("The review date must be after the issue date.");
  }
  if ((await ctx.db.system.get(args.file_id)) === null) {
    throw new ConvexError("The file didn't finish uploading. Please try again.");
  }

  const previous = (await versionsOf(ctx, document._id)).filter((entry) => entry.state === "current");
  if (previous.some((entry) => entry.version.toLowerCase() === version.toLowerCase())) {
    throw new ConvexError(`${version} is already the current version. Use a new version number.`);
  }
  const versionId = await ctx.db.insert("whs_document_versions", {
    document_id: document._id,
    version,
    issued: args.issued,
    review_date: args.review_date,
    file_id: args.file_id,
    file_name: args.file_name,
    content_type: args.content_type,
    state: "current",
    uploaded_by: args.uploaded_by,
  });
  await ctx.db.insert("whs_document_audit", {
    document_id: document._id,
    version_id: versionId,
    action: "uploaded",
    actor_id: args.uploaded_by,
    details: args.change_summary ? `Issued ${version}: ${args.change_summary}` : `Issued ${version}.`,
  });

  for (const old of previous) {
    await ctx.db.patch(old._id, { state: "superseded" });
    await ctx.db.insert("whs_document_audit", {
      document_id: document._id,
      version_id: old._id,
      action: "superseded",
      actor_id: args.uploaded_by,
      details: `Superseded by ${version}. Previous review date: ${old.review_date ?? "none"}.`,
    });
  }
  return versionId;
}

export const issueVersion = internalMutation({
  args: {
    document_id: v.id("whs_documents"),
    version: v.string(),
    issued: v.string(),
    review_date: v.optional(v.string()),
    file_id: v.id("_storage"),
    file_name: v.string(),
    content_type: v.optional(v.string()),
    uploaded_by: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => await issue(ctx, args),
});

export const createDocument = internalMutation({
  args: {
    kind: kindValidator,
    title: v.string(),
    code: v.optional(v.string()),
    category: v.optional(v.string()),
    applies_to: v.optional(v.string()),
    acknowledgement_required: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("whs_documents", { ...args, archived: false });
  },
});

/** A one-page placeholder PDF, so test documents have a file that opens. */
export function placeholderPdf(title: string): Blob {
  const text = title.replace(/[()\\]/g, "");
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj 0 -28 Td /F1 12 Tf (Sample document for testing.) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([body], { type: "application/pdf" });
}

const SAMPLES: {
  kind: Kind;
  title: string;
  code?: string;
  category?: string;
  applies_to?: string;
  acknowledgement_required: boolean;
  versions: { version: string; issued: string; review_date?: string }[];
}[] = [
  {
    kind: "swms",
    title: "Working at Heights - Ladder Use",
    code: "SWMS-03",
    applies_to: "All installers",
    acknowledgement_required: true,
    versions: [{ version: "v3.1", issued: "2026-09-12", review_date: "2027-09-12" }],
  },
  {
    kind: "swms",
    title: "Rail Corridor Panel Installation",
    code: "SWMS-05",
    applies_to: "PTA sites",
    acknowledgement_required: true,
    versions: [
      { version: "v1.9", issued: "2025-10-01", review_date: "2026-10-01" },
      { version: "v2.1", issued: "2026-10-12", review_date: "2027-10-12" },
    ],
  },
  {
    kind: "swms",
    title: "Airport Installation",
    code: "SWMS-07",
    applies_to: "Perth Airport sites",
    acknowledgement_required: true,
    versions: [{ version: "v1.0", issued: "2026-08-01", review_date: "2026-10-30" }],
  },
  {
    kind: "sds",
    title: "Isopropyl Alcohol 70% Cleaner",
    category: "Flammable liquid",
    acknowledgement_required: false,
    versions: [{ version: "2025 issue", issued: "2025-04-08", review_date: "2027-04-08" }],
  },
  {
    kind: "sds",
    title: "Contact Adhesive Spray",
    category: "Aerosol",
    acknowledgement_required: false,
    versions: [{ version: "2026 issue", issued: "2026-01-22", review_date: "2026-11-30" }],
  },
  {
    kind: "document",
    title: "WHS Policy",
    category: "WHS policy",
    applies_to: "Company wide",
    acknowledgement_required: true,
    versions: [{ version: "v2.3", issued: "2026-07-01", review_date: "2027-07-01" }],
  },
  {
    kind: "document",
    title: "WHS Management System",
    category: "WHS Management System",
    applies_to: "Company wide",
    acknowledgement_required: false,
    versions: [{ version: "v4.0", issued: "2026-07-01", review_date: "2027-07-01" }],
  },
  {
    kind: "document",
    title: "JCDecaux Site Safety Management Plan",
    category: "Client document",
    applies_to: "JCDecaux sites",
    acknowledgement_required: false,
    versions: [{ version: "2026 edition", issued: "2026-03-15", review_date: "2027-03-15" }],
  },
];

export const documentTitles = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("whs_documents").collect()).map((document) => document.title),
});

/**
 * Test documents for dev (the user agreed to seeding until the admin screens
 * exist). Skips any title that already exists, so it is safe to run again:
 *   npx convex run documents:seedSamples
 */
export const seedSamples = internalAction({
  args: {},
  handler: async (ctx): Promise<{ added: string[] }> => {
    const existing = new Set(await ctx.runQuery(internal.documents.documentTitles, {}));
    const added: string[] = [];

    for (const sample of SAMPLES) {
      if (existing.has(sample.title)) continue;
      const documentId = await ctx.runMutation(internal.documents.createDocument, {
        kind: sample.kind,
        title: sample.title,
        code: sample.code,
        category: sample.category,
        applies_to: sample.applies_to,
        acknowledgement_required: sample.acknowledgement_required,
      });
      for (const version of sample.versions) {
        const fileId = await ctx.storage.store(placeholderPdf(`${sample.title} ${version.version}`));
        await ctx.runMutation(internal.documents.issueVersion, {
          document_id: documentId,
          ...version,
          file_id: fileId,
          file_name: `${sample.title} ${version.version}.pdf`,
          content_type: "application/pdf",
        });
      }
      added.push(sample.title);
    }
    return { added };
  },
});

/**
 * Issues a new version of a document with a placeholder file, to test
 * superseding and re-acknowledgement:
 *   npx convex run documents:issueTestVersion '{"document_id":"…","version":"v2.2","issued":"2026-10-13"}'
 */
export const issueTestVersion = internalAction({
  args: {
    document_id: v.id("whs_documents"),
    version: v.string(),
    issued: v.string(),
    review_date: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"whs_document_versions">> => {
    const fileId = await ctx.storage.store(placeholderPdf(args.version));
    return await ctx.runMutation(internal.documents.issueVersion, {
      ...args,
      file_id: fileId,
      file_name: `${args.version}.pdf`,
      content_type: "application/pdf",
    });
  },
});

// ---------------------------------------------------------------------------
// Admin dashboard: documents (framework 4A, 10 "upload and verify records")
// ---------------------------------------------------------------------------

async function requireDocumentAdmin(ctx: QueryCtx) {
  const user = await requireCaller(ctx);
  if (!isAdminUser(user)) throw new ConvexError("Only an administrator can manage safety documents.");
  return user;
}

async function requirePanel(ctx: QueryCtx) {
  const user = await requireCaller(ctx);
  if (!canViewCompliance(user)) throw new ConvexError("Only admins and management can open this.");
  return user;
}

/** Everyone asked to acknowledge this document, with their entity: its installers only (decisions D9, AD33). */
async function acknowledgingWorkers(ctx: QueryCtx, document: Doc<"whs_documents">) {
  const [installers, subcontractors] = await Promise.all([
    ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "installer")).collect(),
    ctx.db.query("subcontractors").collect(),
  ]);
  const names = new Map(subcontractors.map((row) => [row._id, row.name]));
  return installers.filter((user) => mustAcknowledgeDocuments(user) && documentIsFor(document, user)).map((user) => ({
    user,
    entity: user.subcontractor_id === undefined ? "Western USI" : (names.get(user.subcontractor_id) ?? "Subcontractor"),
  }));
}

/** The Type list's own choices for a safety document that isn't a SWMS or SDS (web `DOCUMENT_TYPES`). */
export const LISTED_DOCUMENT_TYPES = ["WHS Policy", "WHS Management System", "Client document", "Emergency procedure"];

/** Types typed in under "Other" on earlier documents, archived ones included, offered for the next upload (decision AD48). */
async function typedDocumentTypes(ctx: QueryCtx): Promise<string[]> {
  const documents = await ctx.db
    .query("whs_documents")
    .withIndex("by_kind", (q) => q.eq("kind", "document"))
    .collect();
  const seen = new Set(LISTED_DOCUMENT_TYPES.map((name) => name.toLowerCase()));
  const types: string[] = [];
  for (const document of documents) {
    const name = document.category?.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    types.push(name);
  }
  return types.sort((a, b) => a.localeCompare(b));
}

export const adminDocumentTypes = query({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    await requireDocumentAdmin(ctx);
    return typedDocumentTypes(ctx);
  },
});

const AUDIT_TEXT: Record<string, string> = {
  uploaded: "Version issued",
  superseded: "Version superseded",
  acknowledged: "Acknowledged",
  concern_raised: "Concern raised",
  change_reported: "On-site change recorded",
  change_signed: "On-site change signed",
  change_validated: "On-site change validated",
  change_sent_back: "On-site change sent back",
  reminder_sent: "Reminder sent",
  escalated: "Escalated to management",
  edited: "Details changed",
  archived: "Archived",
};

/** One document for the admin: details, versions, acknowledgements, concerns, on-site changes, activity. */
export const adminDetail = query({
  args: { document_id: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requirePanel(ctx);
    const documentId = ctx.db.normalizeId("whs_documents", args.document_id);
    const document = documentId === null ? null : await ctx.db.get(documentId);
    if (document === null) return null;

    const versions = await versionsOf(ctx, document._id);
    const current = currentOf(versions);
    const workers = await acknowledgingWorkers(ctx, document);
    const acks =
      current === undefined
        ? []
        : await ctx.db
            .query("whs_acknowledgements")
            .withIndex("by_version_and_worker", (q) => q.eq("version_id", current._id))
            .collect();
    const ackAt = new Map(acks.map((ack) => [ack.worker_id, ack._creationTime]));
    const responsible = document.responsible_user_id === undefined ? null : await ctx.db.get(document.responsible_user_id);

    const concerns = await ctx.db
      .query("whs_concerns")
      .withIndex("by_document", (q) => q.eq("document_id", document._id))
      .order("desc")
      .take(20);
    const changes =
      current === undefined || document.kind !== "swms"
        ? []
        : await ctx.db
            .query("swms_changes")
            .withIndex("by_version", (q) => q.eq("version_id", current._id))
            .order("desc")
            .collect();
    const trail = await ctx.db
      .query("whs_document_audit")
      .withIndex("by_document", (q) => q.eq("document_id", document._id))
      .order("desc")
      .take(25);

    return {
      id: document._id,
      kind: document.kind,
      title: document.title,
      code: document.code,
      category: document.category,
      applies_to: document.applies_to,
      for_entities: document.for_entities ?? [],
      for_workers: document.for_workers ?? [],
      for_text: await audienceText(ctx, document),
      acknowledgement_required: document.acknowledgement_required,
      responsible: responsible === null ? undefined : (responsible.name ?? responsible.email),
      responsible_id: document.responsible_user_id,
      notes: document.notes,
      archived: document.archived,
      can_manage: isAdminUser(viewer) && !document.archived,
      current:
        current === undefined
          ? null
          : {
              version_id: current._id,
              version: current.version,
              issued: current.issued,
              review_date: current.review_date,
              file_name: current.file_name,
              url: await ctx.storage.getUrl(current.file_id),
            },
      history: versions
        .filter((version) => version.state === "superseded")
        .reverse()
        .map((version) => ({ version: version.version, issued: version.issued, review_date: version.review_date })),
      acknowledgements: document.acknowledgement_required
        ? workers
            .map(({ user, entity }) => ({
              worker: user.name ?? user.email,
              entity,
              acknowledged_at: ackAt.get(user._id),
            }))
            .sort((a, b) => Number(a.acknowledged_at !== undefined) - Number(b.acknowledged_at !== undefined) || a.worker.localeCompare(b.worker))
        : [],
      concerns: await Promise.all(
        concerns.map(async (concern) => ({
          at: concern._creationTime,
          by: await userName(ctx, concern.worker_id),
          message: concern.message,
        })),
      ),
      changes: await Promise.all(
        changes.map(async (change) => ({
          id: change._id,
          change: change.change,
          date: change.date,
          time: change.time,
          risk_before: change.risk_before,
          risk_after: change.risk_after,
          control: change.control,
          approved_by: change.approved_by,
          site: change.site,
          state: change.state,
          review_reason: change.review_reason,
          reported_by: await userName(ctx, change.reported_by),
          signoffs: (
            await ctx.db
              .query("swms_change_signoffs")
              .withIndex("by_change", (q) => q.eq("change_id", change._id))
              .collect()
          ).length,
        })),
      ),
      activity: await Promise.all(
        trail.map(async (row) => ({
            at: row._creationTime,
            text: AUDIT_TEXT[row.action] ?? row.action,
            by: row.actor_id === undefined ? undefined : await userName(ctx, row.actor_id),
            details: row.details,
          })),
      ),
    };
  },
});

const audienceEntities = v.array(v.union(v.literal("western-usi"), v.id("subcontractors")));

/** Checks the chosen entities and people still exist; returns them without repeats. */
async function checkAudience(ctx: QueryCtx, entities: (Id<"subcontractors"> | "western-usi")[], workers: Id<"users">[]) {
  for (const entity of entities) {
    if (entity === "western-usi") continue;
    const subcontractor = await ctx.db.get(entity);
    if (subcontractor === null || subcontractor.archived) throw new ConvexError("One of the chosen companies no longer exists. Reload and try again.");
  }
  for (const worker of workers) {
    if ((await ctx.db.get(worker)) === null) throw new ConvexError("One of the chosen people no longer exists. Reload and try again.");
  }
  return { for_entities: [...new Set(entities)], for_workers: [...new Set(workers)] };
}

/** "Everyone", or "Western USI, Umar Industries; T. Alvarez" (decision AD33). */
async function audienceText(ctx: QueryCtx, document: Pick<Doc<"whs_documents">, "for_entities" | "for_workers">) {
  const entities = document.for_entities ?? [];
  const workers = document.for_workers ?? [];
  if (entities.length === 0 && workers.length === 0) return "Everyone";
  const names = [
    ...(await Promise.all(
      entities.map(async (entity) => (entity === "western-usi" ? "Western USI" : ((await ctx.db.get(entity))?.name ?? "Removed company"))),
    )),
    ...(await Promise.all(workers.map((worker) => userName(ctx, worker)))),
  ];
  return names.join(", ");
}

function checkText(value: string | undefined, label: string, max = MAX_SHORT_TEXT) {
  const trimmed = value?.trim() || undefined;
  if (trimmed !== undefined && trimmed.length > max) throw new ConvexError(`${label} can be up to ${max} characters.`);
  return trimmed;
}

/** The admin adds a document with its first version (Figma F2, framework 4A). */
export const adminCreate = mutation({
  args: {
    kind: kindValidator,
    title: v.string(),
    code: v.optional(v.string()),
    category: v.optional(v.string()),
    /** The category was typed under "Other", so it must be a new type (decision AD48). */
    new_type: v.optional(v.boolean()),
    applies_to: v.optional(v.string()),
    for_entities: v.optional(audienceEntities),
    for_workers: v.optional(v.array(v.id("users"))),
    acknowledgement_required: v.boolean(),
    responsible_user_id: v.optional(v.id("users")),
    notes: v.optional(v.string()),
    version: v.string(),
    issued: v.string(),
    review_date: v.optional(v.string()),
    file_id: v.id("_storage"),
    file_name: v.string(),
    content_type: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"whs_documents">> => {
    const admin = await requireDocumentAdmin(ctx);
    const title = args.title.trim();
    if (title === "") throw new ConvexError("Enter the document name.");
    checkText(title, "The document name");
    // A safety document that isn't a SWMS or SDS says what kind it is, from the list or typed under "Other" (decision AD40).
    if (args.kind === "document" && !args.category?.trim()) {
      throw new ConvexError("Select the document type, or choose Other and type its name.");
    }
    if (args.kind === "document" && args.new_type) {
      const typed = args.category!.trim().replace(/\s+/g, " ");
      const known = [...LISTED_DOCUMENT_TYPES, ...(await typedDocumentTypes(ctx))];
      const match = known.find((name) => name.toLowerCase() === typed.toLowerCase());
      if (match !== undefined) throw new ConvexError(`There is already a document type called "${match}". Choose it from the list instead.`);
    }
    const existing = await ctx.db.query("whs_documents").withIndex("by_archived", (q) => q.eq("archived", false)).collect();
    if (existing.some((document) => document.title.toLowerCase() === title.toLowerCase())) {
      throw new ConvexError(`A document called "${title}" already exists. Open it and upload a new version instead.`);
    }
    if (args.responsible_user_id !== undefined && (await ctx.db.get(args.responsible_user_id)) === null) {
      throw new ConvexError("That responsible person no longer exists.");
    }

    const documentId = await ctx.db.insert("whs_documents", {
      kind: args.kind,
      title,
      code: checkText(args.code, "The document code"),
      category: checkText(args.category, "The category"),
      applies_to: checkText(args.applies_to, "Client or work type"),
      ...(await checkAudience(ctx, args.for_entities ?? [], args.for_workers ?? [])),
      acknowledgement_required: args.acknowledgement_required,
      responsible_user_id: args.responsible_user_id,
      notes: checkText(args.notes, "Notes", MAX_TEXT),
      archived: false,
    });
    await issue(ctx, {
      document_id: documentId,
      version: args.version,
      issued: args.issued,
      review_date: args.review_date,
      file_id: args.file_id,
      file_name: args.file_name,
      content_type: args.content_type,
      uploaded_by: admin._id,
    });
    return documentId;
  },
});

/** The admin issues a new version (Figma A4); the current one is superseded. */
export const adminIssueVersion = mutation({
  args: {
    document_id: v.id("whs_documents"),
    version: v.string(),
    issued: v.string(),
    review_date: v.optional(v.string()),
    change_summary: v.string(),
    acknowledgement_required: v.boolean(),
    responsible_user_id: v.optional(v.id("users")),
    file_id: v.id("_storage"),
    file_name: v.string(),
    content_type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireDocumentAdmin(ctx);
    const summary = args.change_summary.trim();
    if (summary === "") throw new ConvexError("Summarise what changed in this version.");
    checkText(summary, "The change summary", MAX_TEXT);
    const document = await ctx.db.get(args.document_id);
    if (document === null || document.archived) throw new ConvexError("That document no longer exists.");

    await ctx.db.patch(document._id, {
      acknowledgement_required: args.acknowledgement_required,
      ...(args.responsible_user_id !== undefined ? { responsible_user_id: args.responsible_user_id } : {}),
    });
    const versionId = await issue(ctx, { ...args, change_summary: summary, uploaded_by: admin._id });
    const version = await ctx.db.get(versionId);
    return { version: version?.version ?? args.version };
  },
});

/**
 * Emails every worker who hasn't acknowledged the current version, now
 * (Figma A6). Skipped on a deployment with reminders switched off
 * (WHS_REMINDERS_OFF), so test data never emails anyone.
 */
export const adminSendReminder = mutation({
  args: { document_id: v.id("whs_documents") },
  handler: async (ctx, args): Promise<{ outstanding: number; emailed: boolean }> => {
    const admin = await requireDocumentAdmin(ctx);
    const document = await ctx.db.get(args.document_id);
    if (document === null || document.archived) throw new ConvexError("That document no longer exists.");
    if (!document.acknowledgement_required) throw new ConvexError("This document doesn't need acknowledging.");
    const current = currentOf(await versionsOf(ctx, document._id));
    if (current === undefined) throw new ConvexError("That document has no current version.");

    const signed = new Set(
      (
        await ctx.db
          .query("whs_acknowledgements")
          .withIndex("by_version_and_worker", (q) => q.eq("version_id", current._id))
          .collect()
      ).map((ack) => ack.worker_id),
    );
    const outstanding = (await acknowledgingWorkers(ctx, document)).filter(({ user }) => !signed.has(user._id));
    if (outstanding.length === 0) throw new ConvexError("Everyone has already acknowledged this version.");

    const emailed = process.env.WHS_REMINDERS_OFF !== "true";
    if (emailed) {
      for (const [index, { user }] of outstanding.entries()) {
        await ctx.scheduler.runAfter(index * 600, internal.email.sendWhsEmail, {
          to: [user.email],
          subject: `Please read and sign ${document.title} (${current.version})`,
          lines: [
            `Hi ${user.name ?? user.email},`,
            `Please read and acknowledge ${document.title} (${current.version}) in the Western USI InstallFlow app.`,
          ],
          link: { label: "Open it in the app", url: documentLink(document._id) },
        });
      }
    }
    await ctx.db.insert("whs_document_audit", {
      document_id: document._id,
      version_id: current._id,
      action: "reminder_sent",
      actor_id: admin._id,
      details: emailed
        ? `Reminder sent to ${outstanding.length} outstanding ${outstanding.length === 1 ? "worker" : "workers"}.`
        : `Reminder not emailed (reminders are off on this deployment); ${outstanding.length} outstanding.`,
    });
    return { outstanding: outstanding.length, emailed };
  },
});

/**
 * The admin corrects a document's details, who it is for, and the current
 * version's review date, with a reason (framework 4A, 11; decisions AD32,
 * AD33). A new file is a new version instead.
 */
export const adminEdit = mutation({
  args: {
    document_id: v.id("whs_documents"),
    title: v.string(),
    category: v.optional(v.string()),
    applies_to: v.optional(v.string()),
    for_entities: audienceEntities,
    for_workers: v.array(v.id("users")),
    acknowledgement_required: v.boolean(),
    responsible_user_id: v.union(v.id("users"), v.null()),
    notes: v.optional(v.string()),
    review_date: v.optional(v.string()),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireDocumentAdmin(ctx);
    const document = await ctx.db.get(args.document_id);
    if (document === null || document.archived) throw new ConvexError("That document no longer exists.");
    const reason = checkReason(args.reason);
    const title = args.title.trim();
    if (title === "") throw new ConvexError("Enter the document name.");
    checkText(title, "The document name");
    if (title.toLowerCase() !== document.title.toLowerCase()) {
      const others = await ctx.db.query("whs_documents").withIndex("by_archived", (q) => q.eq("archived", false)).collect();
      if (others.some((other) => other._id !== document._id && other.title.toLowerCase() === title.toLowerCase())) {
        throw new ConvexError(`A document called "${title}" already exists.`);
      }
    }
    if (args.responsible_user_id !== null && (await ctx.db.get(args.responsible_user_id)) === null) {
      throw new ConvexError("That responsible person no longer exists. Choose someone else.");
    }
    const current = currentOf(await versionsOf(ctx, document._id));
    const reviewDate = args.review_date || undefined;
    if (reviewDate !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate)) throw new ConvexError("Select a valid review date.");
      if (current !== undefined && reviewDate <= current.issued) throw new ConvexError("The review date must be after the issue date.");
    }
    const audience = await checkAudience(ctx, args.for_entities, args.for_workers);
    const next = {
      title,
      category: checkText(args.category, "The category"),
      applies_to: checkText(args.applies_to, "Client or work type"),
      ...audience,
      acknowledgement_required: args.acknowledgement_required,
      responsible_user_id: args.responsible_user_id ?? undefined,
      notes: checkText(args.notes, "Notes", MAX_TEXT),
    };
    const details = describeEdit(
      [
        { label: "Name", before: document.title, after: next.title },
        { label: "Category", before: document.category, after: next.category },
        { label: "Client or work type", before: document.applies_to, after: next.applies_to },
        { label: "Who must read and sign", before: await audienceText(ctx, document), after: await audienceText(ctx, next) },
        { label: "Acknowledgement required", before: document.acknowledgement_required, after: next.acknowledgement_required, kind: "flag" },
        {
          label: "Responsible person",
          before: document.responsible_user_id === undefined ? undefined : await userName(ctx, document.responsible_user_id),
          after: next.responsible_user_id === undefined ? undefined : await userName(ctx, next.responsible_user_id),
        },
        { label: "Review date", before: current?.review_date, after: current === undefined ? undefined : reviewDate, kind: "date" },
        { label: "Notes", before: document.notes, after: next.notes, kind: "long" },
      ],
      reason,
    );
    await ctx.db.patch(document._id, next);
    if (current !== undefined && current.review_date !== reviewDate) await ctx.db.patch(current._id, { review_date: reviewDate });
    await ctx.db.insert("whs_document_audit", {
      document_id: document._id,
      version_id: current?._id,
      action: "edited",
      actor_id: admin._id,
      details,
    });
  },
});

/** The admin archives a document that is withdrawn, with a reason. Workers stop seeing it; it is kept, never deleted (framework 11). */
export const adminArchive = mutation({
  args: { document_id: v.id("whs_documents"), reason: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireDocumentAdmin(ctx);
    const document = await ctx.db.get(args.document_id);
    if (document === null || document.archived) throw new ConvexError("That document is already archived.");
    const reason = checkReason(args.reason, "archive");
    await ctx.db.patch(document._id, { archived: true });
    await ctx.db.insert("whs_document_audit", { document_id: document._id, action: "archived", actor_id: admin._id, details: reason });
  },
});

// ---------------------------------------------------------------------------
// An entity's Documents tab (decision AD41)
// ---------------------------------------------------------------------------

/** Where a worker belongs: "western-usi" or their subcontractor's id. */
const entityOfUser = (user: Pick<Doc<"users">, "subcontractor_id">): string => user.subcontractor_id ?? "western-usi";

/** Checks an entity id from the entity pages: "western-usi", or a subcontractor that still exists. */
async function checkEntity(ctx: QueryCtx, entity: string): Promise<"western-usi" | Id<"subcontractors">> {
  if (entity === "western-usi") return "western-usi";
  const id = ctx.db.normalizeId("subcontractors", entity);
  const subcontractor = id === null ? null : await ctx.db.get(id);
  if (subcontractor === null || subcontractor.archived) throw new ConvexError("That company no longer exists.");
  return subcontractor._id;
}

/**
 * The safety documents one entity's workers are asked to read and sign
 * (`assigned`, with how many have signed), and the ones that aren't for them
 * (`available`, to add). A document that is for everyone counts as assigned.
 */
export const forEntity = query({
  args: { entity: v.string() },
  handler: async (ctx, args) => {
    await requirePanel(ctx);
    const entity = await checkEntity(ctx, args.entity);
    const [documents, installers] = await Promise.all([
      ctx.db.query("whs_documents").withIndex("by_archived", (q) => q.eq("archived", false)).collect(),
      ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "installer")).collect(),
    ]);
    const team = installers.filter((user) => entityOfUser(user) === entity);

    const assigned = [];
    const available = [];
    for (const document of documents) {
      const forWorkers = new Set(document.for_workers ?? []);
      const everyone = (document.for_entities ?? []).length === 0 && forWorkers.size === 0;
      const wholeEntity = (document.for_entities ?? []).includes(entity);
      const somePeople = team.some((user) => forWorkers.has(user._id));
      const summary = { id: document._id, title: document.title, kind: document.kind, category: document.category };
      if (!everyone && !wholeEntity && !somePeople) {
        available.push(summary);
        continue;
      }
      const askedWorkers = team.filter((user) => documentIsFor(document, user));
      const current = currentOf(await versionsOf(ctx, document._id));
      const signed =
        current === undefined || !document.acknowledgement_required
          ? 0
          : (
              await Promise.all(askedWorkers.map((user) => myAcknowledgement(ctx, current._id, user._id)))
            ).filter((ack) => ack !== null).length;
      assigned.push({
        ...summary,
        for: everyone ? ("everyone" as const) : wholeEntity ? ("all" as const) : ("some" as const),
        asked: askedWorkers.length,
        signed,
        acknowledgement_required: document.acknowledgement_required,
        version: current?.version,
      });
    }
    const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title);
    return { assigned: assigned.sort(byTitle), available: available.sort(byTitle) };
  },
});

/**
 * The admin adds a document to an entity's list, or removes it, from the
 * entity's Documents tab, with a reason (decisions AD32, AD41). Adding makes
 * the entity's workers ask for it. Removing takes the entity out of who it is
 * for; a document that was for everyone becomes "everyone else".
 */
export const adminSetEntity = mutation({
  args: { document_id: v.id("whs_documents"), entity: v.string(), assigned: v.boolean(), reason: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireDocumentAdmin(ctx);
    const document = await ctx.db.get(args.document_id);
    if (document === null || document.archived) throw new ConvexError("That document no longer exists.");
    const entity = await checkEntity(ctx, args.entity);
    const reason = checkReason(args.reason);

    const entities = document.for_entities ?? [];
    const workers = document.for_workers ?? [];
    const everyone = entities.length === 0 && workers.length === 0;

    let nextEntities: (Id<"subcontractors"> | "western-usi")[];
    let nextWorkers: Id<"users">[];
    if (args.assigned) {
      if (everyone || entities.includes(entity)) throw new ConvexError("That document is already for this company.");
      nextEntities = [...entities, entity];
      // Anyone picked one by one at this company is now covered by the whole company.
      const theirs = new Set<Id<"users">>();
      for (const worker of workers) {
        const user = await ctx.db.get(worker);
        if (user !== null && entityOfUser(user) === entity) theirs.add(worker);
      }
      nextWorkers = workers.filter((worker) => !theirs.has(worker));
    } else {
      if (everyone) {
        // "Everyone" becomes every other company, so this one drops out.
        const subcontractors = (await ctx.db.query("subcontractors").collect()).filter((row) => !row.archived);
        const all: (Id<"subcontractors"> | "western-usi")[] = ["western-usi", ...subcontractors.map((row) => row._id)];
        nextEntities = all.filter((id) => id !== entity);
        nextWorkers = [];
      } else {
        nextEntities = entities.filter((id) => id !== entity);
        nextWorkers = [];
        for (const worker of workers) {
          const user = await ctx.db.get(worker);
          if (user === null || entityOfUser(user) !== entity) nextWorkers.push(worker);
        }
      }
      if (nextEntities.length === 0 && nextWorkers.length === 0) {
        throw new ConvexError(
          "This is the only company this document is for. Add another company first, or archive the document if it is no longer needed.",
        );
      }
    }

    const next = { for_entities: nextEntities, for_workers: nextWorkers };
    const details = describeEdit(
      [{ label: "Who must read and sign", before: await audienceText(ctx, document), after: await audienceText(ctx, next) }],
      reason,
    );
    await ctx.db.patch(document._id, next);
    await ctx.db.insert("whs_document_audit", {
      document_id: document._id,
      version_id: currentOf(await versionsOf(ctx, document._id))?._id,
      action: "edited",
      actor_id: admin._id,
      details,
    });
  },
});
