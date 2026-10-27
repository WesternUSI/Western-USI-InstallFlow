import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { accreditationDetail, requireCaller, saveUpload, workerAccreditations } from "./accreditations";
import { agreementsOf, agreementStatus } from "./agreements";
import { enabledRecipientEmails } from "./emails";
import { certificatesOf, INSURANCE_TYPE_LABELS, policyDetail, policyStatus, saveContactRenewal } from "./insurance";
import { documentIsFor, holdsAccreditations, mustAcknowledgeDocuments } from "./permissions";
import { businessToday, formatLongDate } from "./whsDates";
import { adminPanelLink } from "./whsLinks";

/**
 * The subcontractor portal (framework 10 "Subcontractor contact"): a
 * subcontractor's login sees its own business only, never another's, and
 * uploads its insurance renewals and its workers' evidence. Every upload waits
 * for Western USI to verify it; the contact never verifies (decision AD50).
 */

/** The signed-in subcontractor login and its company, or an error for anyone else. */
async function requireContact(ctx: QueryCtx) {
  const user = await requireCaller(ctx);
  if (user.role !== "subcontractor" || user.subcontractor_id === undefined) {
    throw new ConvexError("Only a subcontractor's login can open the subcontractor portal.");
  }
  const company = await ctx.db.get(user.subcontractor_id);
  if (company === null) {
    throw new ConvexError("Your company is no longer set up. Contact Western USI.");
  }
  return { user, company };
}

/** Whether someone has any accreditation evidence on file. */
async function hasEvidence(ctx: QueryCtx, userId: Id<"users">) {
  return (await ctx.db.query("whs_records").withIndex("by_worker", (q) => q.eq("worker_id", userId)).first()) !== null;
}

/** The company's workers: its installers, and its logins that are also workers (decision R6), A-Z. */
async function workersOf(ctx: QueryCtx, companyId: Id<"subcontractors">) {
  const [installers, logins] = await Promise.all([
    ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "installer")).collect(),
    ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "subcontractor")).collect(),
  ]);
  const ownLogins = logins.filter((user) => user.subcontractor_id === companyId);
  const workingLogins = [];
  for (const login of ownLogins) {
    if (holdsAccreditations(login, await hasEvidence(ctx, login._id))) workingLogins.push(login);
  }
  return [...installers.filter((user) => user.subcontractor_id === companyId), ...workingLogins].sort((a, b) =>
    (a.name ?? a.email).localeCompare(b.name ?? b.email),
  );
}

async function policiesOf(ctx: QueryCtx, companyId: Id<"subcontractors">) {
  const today = businessToday();
  const policies = (
    await ctx.db
      .query("insurance_policies")
      .withIndex("by_subcontractor", (q) => q.eq("subcontractor_id", companyId))
      .collect()
  ).filter((policy) => !policy.archived);
  return await Promise.all(
    policies.map(async (policy) => {
      const certificates = await certificatesOf(ctx, policy._id);
      const shown = [...certificates].reverse().find((certificate) => certificate.state === "pending" || certificate.state === "verified");
      return {
        id: policy._id,
        type: INSURANCE_TYPE_LABELS[policy.insurance_type],
        insurer: policy.insurer,
        coverage: policy.coverage,
        policy_number: policy.policy_number,
        expires: shown?.expires,
        status: policyStatus(certificates, today),
      };
    }),
  );
}

/** How many current SWMS each of the company's workers still has to sign (each worker signs personally). */
async function swmsToSign(ctx: QueryCtx, workers: Doc<"users">[]) {
  const owed = new Map<Id<"users">, number>();
  const acknowledgers = workers.filter(mustAcknowledgeDocuments);
  if (acknowledgers.length === 0) return owed;
  const [documents, currentVersions] = await Promise.all([
    ctx.db.query("whs_documents").withIndex("by_archived", (q) => q.eq("archived", false)).collect(),
    ctx.db
      .query("whs_document_versions")
      .withIndex("by_state_and_review", (q) => q.eq("state", "current"))
      .collect(),
  ]);
  const currentByDocument = new Map(currentVersions.map((version) => [version.document_id, version]));
  for (const document of documents) {
    const current = currentByDocument.get(document._id);
    if (document.kind !== "swms" || !document.acknowledgement_required || current === undefined) continue;
    for (const worker of acknowledgers) {
      if (!documentIsFor(document, worker)) continue;
      const signed = await ctx.db
        .query("whs_acknowledgements")
        .withIndex("by_version_and_worker", (q) => q.eq("version_id", current._id).eq("worker_id", worker._id))
        .unique();
      if (signed === null) owed.set(worker._id, (owed.get(worker._id) ?? 0) + 1);
    }
  }
  return owed;
}

/** The company's name, for every portal page's heading, and whether the signed-in login is also one of its workers. */
export const company = query({
  args: {},
  handler: async (ctx) => {
    const { user, company } = await requireContact(ctx);
    return { name: company.name, is_worker: holdsAccreditations(user, await hasEvidence(ctx, user._id)) };
  },
});

/**
 * The company's own details (framework 4D): ABN, primary contact and the
 * signed subcontractor agreement, which the contact can open but not change.
 */
export const business = query({
  args: {},
  handler: async (ctx) => {
    const { company } = await requireContact(ctx);
    const agreements = await agreementsOf(ctx, company._id);
    const latest = agreements[agreements.length - 1] ?? null;
    return {
      name: company.name,
      abn: company.abn,
      contact_name: company.contact_name,
      contact_email: company.contact_email,
      contact_phone: company.contact_phone,
      agreement: {
        status: agreementStatus(latest, businessToday()),
        signed_on: latest?.signed_on,
        review_date: latest?.review_date,
        file_name: latest?.file_name,
        file_url: latest === null ? null : await ctx.storage.getUrl(latest.file_id),
      },
    };
  },
});

/** S1 Our Compliance: every insurance policy and worker accreditation with its status, plus the counts. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const { company } = await requireContact(ctx);
    const workers = await workersOf(ctx, company._id);
    const [policies, perWorker, swms, agreements] = await Promise.all([
      policiesOf(ctx, company._id),
      Promise.all(workers.map(async (worker) => ({ worker, list: await workerAccreditations(ctx, worker) }))),
      swmsToSign(ctx, workers),
      agreementsOf(ctx, company._id),
    ]);
    return {
      workers: workers.length,
      swms_outstanding: [...swms.values()].reduce((total, count) => total + count, 0),
      agreement: agreementStatus(agreements[agreements.length - 1] ?? null, businessToday()),
      items: [
        ...policies.map((policy) => ({
          kind: "insurance" as const,
          id: policy.id as string,
          name: policy.type,
          related: company.name,
          status: policy.status,
          rejected_reason: undefined as string | undefined,
        })),
        ...perWorker.flatMap(({ worker, list }) =>
          list.items.map((item) => ({
            kind: "accreditation" as const,
            id: item.key as string,
            name: item.name,
            related: worker.name ?? worker.email,
            status: item.status,
            rejected_reason: item.rejected_reason,
          })),
        ),
      ],
    };
  },
});

/** S2 Our Insurance: the company's policies. */
export const insurance = query({
  args: {},
  handler: async (ctx) => {
    const { company } = await requireContact(ctx);
    return await policiesOf(ctx, company._id);
  },
});

/** S3 One of the company's policies; null for anyone else's. */
export const policy = query({
  args: { policy_id: v.string() },
  handler: async (ctx, args) => {
    const { user, company } = await requireContact(ctx);
    return await policyDetail(ctx, user, args.policy_id, (policy) => policy.subcontractor_id === company._id && !policy.archived);
  },
});

/** S7 Our Workers: each worker with what they hold, what needs action and the SWMS they still have to sign. */
export const workers = query({
  args: {},
  handler: async (ctx) => {
    const { company } = await requireContact(ctx);
    const workers = await workersOf(ctx, company._id);
    const swms = await swmsToSign(ctx, workers);
    return await Promise.all(
      workers.map(async (worker) => {
        const { items } = await workerAccreditations(ctx, worker);
        return {
          id: worker._id,
          name: worker.name ?? worker.email,
          swms_to_sign: swms.get(worker._id) ?? 0,
          held: items.filter((item) => item.has_evidence).map((item) => item.name),
          attention: items.filter((item) => item.needs_attention).map((item) => ({ key: item.key, name: item.name, status: item.status })),
        };
      }),
    );
  },
});

/** S8 One of the company's workers and their accreditations; null for anyone else's. */
export const worker = query({
  args: { worker_id: v.string() },
  handler: async (ctx, args) => {
    const { company } = await requireContact(ctx);
    const workerId = ctx.db.normalizeId("users", args.worker_id);
    const worker = workerId === null ? null : await ctx.db.get(workerId);
    if (worker === null || worker.subcontractor_id !== company._id) return null;
    return await workerAccreditations(ctx, worker);
  },
});

/** S9 One of the company's workers' accreditations; null for anyone else's. */
export const accreditation = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const { user, company } = await requireContact(ctx);
    return await accreditationDetail(ctx, user, args.key, (worker) => worker.subcontractor_id === company._id);
  },
});

// ---------------------------------------------------------------------------
// Uploads (framework 8, 10)
// ---------------------------------------------------------------------------

/** Tells the admin list something is waiting for them to check (best effort). */
async function tellAdmins(ctx: MutationCtx, subject: string, line: string, path: string) {
  const to = await enabledRecipientEmails(ctx);
  if (to.length === 0) return;
  await ctx.scheduler.runAfter(0, internal.email.sendWhsEmail, {
    to,
    subject,
    lines: [line, "It is waiting for you to check and verify it in the admin panel."],
    link: adminPanelLink(path),
  });
}

function required(value: string, message: string) {
  if (value.trim() === "") throw new ConvexError(message);
  return value.trim();
}

/** A one-off URL to upload a certificate or evidence file to. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireContact(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** S4 Upload Insurance Renewal: a new certificate for one of the company's policies, waiting for review. */
export const uploadInsuranceRenewal = mutation({
  args: {
    policy_id: v.string(),
    start: v.string(),
    expires: v.string(),
    file_id: v.id("_storage"),
    file_name: v.string(),
    content_type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, company } = await requireContact(ctx);
    const policyId = ctx.db.normalizeId("insurance_policies", args.policy_id);
    const policy = policyId === null ? null : await ctx.db.get(policyId);
    if (policy === null || policy.archived || policy.subcontractor_id !== company._id) {
      throw new ConvexError("That policy no longer exists.");
    }
    const start = required(args.start, "Select the policy start date on the new certificate.");
    const expires = required(args.expires, "Select the expiry date on the new certificate.");
    const fileName = required(args.file_name, "Choose the certificate of currency to upload.");
    await saveContactRenewal(ctx, user, policy, { ...args, start, expires, file_name: fileName });

    const type = INSURANCE_TYPE_LABELS[policy.insurance_type];
    await tellAdmins(
      ctx,
      `${company.name} uploaded a ${type} renewal`,
      `${user.name ?? user.email} uploaded a new ${type} certificate for ${company.name}, expiring ${formatLongDate(expires)}.`,
      `/safety/insurance/${policy._id}`,
    );
  },
});

/** S10–S12 One of the company's workers' evidence: a renewal, a missing one, or a replacement Western USI asked for. */
export const uploadWorkerEvidence = mutation({
  args: {
    worker_id: v.string(),
    type_id: v.string(),
    file_id: v.id("_storage"),
    file_name: v.string(),
    content_type: v.optional(v.string()),
    number: v.optional(v.string()),
    issued: v.optional(v.string()),
    expires: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, company } = await requireContact(ctx);
    const workerId = ctx.db.normalizeId("users", args.worker_id);
    const worker = workerId === null ? null : await ctx.db.get(workerId);
    if (worker === null || worker.subcontractor_id !== company._id) {
      throw new ConvexError("That worker isn't one of yours any more.");
    }
    const typeId = ctx.db.normalizeId("accreditation_types", args.type_id);
    if (typeId === null) throw new ConvexError("That accreditation type no longer exists.");
    const fileName = required(args.file_name, "Choose the evidence file to upload.");
    const result = await saveUpload(ctx, user, worker, { ...args, type_id: typeId, file_name: fileName });

    const [type, record] = await Promise.all([
      ctx.db.get(typeId),
      ctx.db
        .query("whs_records")
        .withIndex("by_worker_and_type", (q) => q.eq("worker_id", worker._id).eq("type_id", typeId))
        .unique(),
    ]);
    const workerName = worker.name ?? worker.email;
    await tellAdmins(
      ctx,
      `${company.name} uploaded ${type?.name ?? "evidence"} for ${workerName}`,
      `${user.name ?? user.email} (${company.name}) uploaded ${type?.name ?? "accreditation"} evidence for ${workerName}.`,
      `/safety/accreditations/${record?._id ?? ""}`,
    );
    return result;
  },
});
