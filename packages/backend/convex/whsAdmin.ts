import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { certificatesOf, entityName, INSURANCE_TYPE_LABELS, policyStatus } from "./insurance";
import { deriveKitStatus } from "./kits";
import { deriveVehicleStatus, VEHICLE_STATUS_LABELS, type VehicleStatus } from "./vehicles";
import { canViewCompliance, documentIsFor, isAdminUser, mustAcknowledgeDocuments } from "./permissions";
import { businessToday, addDays } from "./whsDates";
import { deriveAccreditationStatus, dueSoonWindowDays } from "./whsStatus";

/**
 * The admin's WHS & Compliance Register (framework 9): one row per record
 * across the categories that have a backend so far: accreditations (every
 * required one, including Missing), safety documents, first-aid kits,
 * insurance policies and vehicles. Statuses are worked out, never stored
 * (framework 6).
 */

export type RegisterStatus =
  | "current"
  | "due-soon"
  | "overdue"
  | "expired"
  | "missing"
  | "awaiting-verification"
  | "action-required"
  | "renewal-in-progress"
  | "out-of-service";

export interface RegisterRow {
  id: string;
  name: string;
  category: "accreditation" | "swms" | "sds" | "document" | "first-aid" | "insurance" | "vehicle";
  entity: string;
  /** The worker the record is about, when there is one. */
  person?: string;
  status: RegisterStatus;
  /** `YYYY-MM-DD`: expiry, review or next inspection. */
  due?: string;
  /** Documents: workers who still have to acknowledge the current version. */
  outstanding?: number;
  /** Accreditations: whose it is, for the management matrix and worker pages (decision AD43). */
  worker_id?: string;
  /** SWMS: on-site changes to the current version waiting for the admin (decision D3). */
  changes_to_review?: number;
  /** A more specific status to show, e.g. "Registration expiring" for a vehicle. */
  label?: string;
  /** Who is chased for it (framework 5, 9 filter); "Admin list" when nobody is set. */
  responsible?: string;
  /** The vehicle it concerns: a vehicle, or a kit kept in one (framework 9 filter). */
  vehicle?: string;
}

/** The admin panel's own gate: admins only. */
export async function requirePanelUser(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  const user =
    identity === null
      ? null
      : await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
          .unique();
  if (user === null || !isAdminUser(user)) {
    throw new Error("Not authorized");
  }
  return user;
}

const ADMIN_LIST = "Admin list";

const DOCUMENT_REVIEW_DAYS: Record<Doc<"whs_documents">["kind"], number> = { swms: 30, document: 30, sds: 60 };

/** The register and an entity's history are open to admins and management (decision AD43); reports stay admin-only. */
async function requireComplianceViewer(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  const user =
    identity === null
      ? null
      : await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerk_id", identity.subject))
          .unique();
  if (user === null || !canViewCompliance(user)) {
    throw new Error("Not authorized");
  }
  return user;
}

export const register = query({
  args: {},
  handler: async (ctx): Promise<{ rows: RegisterRow[]; entities: string[]; today: string }> => {
    await requireComplianceViewer(ctx);
    const today = businessToday();

    // Every read is indexed to skip what the register doesn't show: other
    // roles, archived rows, superseded versions and old acknowledgements.
    const versionsInState = (state: "pending" | "verified" | "rejected") =>
      ctx.db
        .query("whs_record_versions")
        .withIndex("by_state_and_expires", (q) => q.eq("state", state))
        .collect();
    const [installers, logins, subcontractors, types, requirements, records, pending, verified, rejected] = await Promise.all([
      ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "installer")).collect(),
      ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "subcontractor")).collect(),
      ctx.db.query("subcontractors").withIndex("by_archived", (q) => q.eq("archived", false)).collect(),
      ctx.db.query("accreditation_types").collect(),
      ctx.db.query("accreditation_requirements").collect(),
      ctx.db.query("whs_records").collect(),
      versionsInState("pending"),
      versionsInState("verified"),
      versionsInState("rejected"),
    ]);
    // Oldest first within a record, as the status rules expect.
    const versions = [...pending, ...verified, ...rejected].sort((a, b) => a._creationTime - b._creationTime);
    const subcontractorName = new Map(subcontractors.map((row) => [row._id, row.name]));
    const entityOf = (user: Doc<"users"> | null | undefined) =>
      user?.subcontractor_id === undefined || user === null ? "Western USI" : (subcontractorName.get(user.subcontractor_id) ?? "Subcontractor");
    const typeById = new Map(types.map((type) => [type._id, type]));
    const names = new Map<Id<"users">, string>();
    const nameOf = async (id: Id<"users"> | undefined) => {
      if (id === undefined) return ADMIN_LIST;
      const known = names.get(id);
      if (known !== undefined) return known;
      const user = await ctx.db.get(id);
      const name = user === null ? ADMIN_LIST : (user.name ?? user.email);
      names.set(id, name);
      return name;
    };

    const rows: RegisterRow[] = [];

    // Accreditations: every type a worker must hold, plus any they uploaded (framework 4B).
    const versionsByRecord = new Map<Id<"whs_records">, Doc<"whs_record_versions">[]>();
    for (const version of versions) {
      versionsByRecord.set(version.record_id, [...(versionsByRecord.get(version.record_id) ?? []), version]);
    }
    // Accreditations: installers and subcontractor logins (decision R6).
    const workers = [...installers, ...logins];
    // Acknowledgements: installers only (decision D9).
    const acknowledgers = workers.filter(mustAcknowledgeDocuments);
    for (const worker of workers) {
      const required = new Set(
        requirements.filter((row) => row.subcontractor_id === worker.subcontractor_id).map((row) => row.type_id),
      );
      const own = records.filter((record) => record.worker_id === worker._id);
      const typeIds = new Set([...required, ...own.map((record) => record.type_id)]);
      for (const typeId of typeIds) {
        const type = typeById.get(typeId);
        if (type === undefined || (type.archived && !own.some((record) => record.type_id === typeId))) continue;
        const record = own.find((entry) => entry.type_id === typeId);
        const history = record === undefined ? [] : (versionsByRecord.get(record._id) ?? []);
        const status = deriveAccreditationStatus(history, today, dueSoonWindowDays(type.reminder_days));
        const shown = [...history].reverse().find((version) => version.state === "pending" || version.state === "verified");
        rows.push({
          id: record?._id ?? `${worker._id}:${typeId}`,
          name: type.name,
          category: "accreditation",
          worker_id: worker._id,
          entity: entityOf(worker),
          person: worker.name ?? worker.email,
          status,
          due: shown?.expires,
          responsible: record === undefined ? (worker.name ?? worker.email) : await nameOf(record.responsible_user_id),
        });
      }
    }

    // Safety documents (framework 4A): status from the review date; outstanding acknowledgements counted.
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
      if (current === undefined) continue;
      // Only this version's acknowledgements, never the history of older ones.
      const acknowledgements = await ctx.db
        .query("whs_acknowledgements")
        .withIndex("by_version_and_worker", (q) => q.eq("version_id", current._id))
        .collect();
      const signed = new Set(acknowledgements.map((ack) => ack.worker_id));
      const outstanding = document.acknowledgement_required
        ? acknowledgers.filter((worker) => documentIsFor(document, worker) && !signed.has(worker._id)).length
        : 0;

      let status: RegisterStatus = "current";
      if (current.review_date !== undefined) {
        if (current.review_date < today) status = "overdue";
        else if (current.review_date <= addDays(today, DOCUMENT_REVIEW_DAYS[document.kind])) status = "due-soon";
      }
      // Workers still to acknowledge: someone has to act (the SWMS card, framework 9).
      if (status === "current" && outstanding > 0) status = "action-required";

      rows.push({
        id: document._id,
        name: document.title,
        category: document.kind,
        entity: "Western USI",
        status,
        due: current.review_date,
        outstanding,
        changes_to_review:
          document.kind === "swms"
            ? (
                await ctx.db
                  .query("swms_changes")
                  .withIndex("by_version", (q) => q.eq("version_id", current._id))
                  .collect()
              ).filter((change) => change.state === "awaiting-review").length
            : undefined,
        responsible: await nameOf(document.responsible_user_id),
      });
    }

    // First-aid kits (framework 4F).
    const kits = await ctx.db
      .query("first_aid_kits")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .collect();
    for (const kit of kits) {
      const latest = await ctx.db
        .query("kit_inspections")
        .withIndex("by_kit", (q) => q.eq("kit_id", kit._id))
        .order("desc")
        .first();
      const openIssue = latest !== null && latest.answers.some((entry) => entry.answer === "action") && latest.resolved_at === undefined;
      const responsible = kit.responsible_user_id === undefined ? null : await ctx.db.get(kit.responsible_user_id);
      rows.push({
        id: kit._id,
        name: `Kit ${kit.code} · ${kit.location}`,
        category: "first-aid",
        entity: entityOf(responsible),
        person: responsible === null ? undefined : (responsible.name ?? responsible.email),
        status: deriveKitStatus(kit.next_inspection, openIssue, today),
        due: kit.next_inspection,
        responsible: responsible === null ? ADMIN_LIST : (responsible.name ?? responsible.email),
        // A kit kept in a vehicle names it in its location, e.g. "Vehicle 1EAB119".
        vehicle: /vehicle\s+([A-Z0-9]+)/i.exec(kit.location)?.[1]?.toUpperCase(),
      });
    }

    // Insurance policies (framework 4C).
    const policies = await ctx.db
      .query("insurance_policies")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .collect();
    for (const policy of policies) {
      const certificates = await certificatesOf(ctx, policy._id);
      const shown = [...certificates].reverse().find((certificate) => certificate.state === "pending" || certificate.state === "verified");
      rows.push({
        id: policy._id,
        name: INSURANCE_TYPE_LABELS[policy.insurance_type],
        category: "insurance",
        entity: await entityName(ctx, policy.subcontractor_id),
        status: policyStatus(certificates, today),
        due: shown?.expires,
        responsible: await nameOf(policy.responsible_user_id),
      });
    }

    // Vehicles (framework 4E): one row each, the most urgent of its dates.
    const vehicles = await ctx.db
      .query("vehicles")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .collect();
    const VEHICLE_TO_REGISTER: Record<VehicleStatus, RegisterStatus> = {
      current: "current",
      "service-due-soon": "due-soon",
      "registration-expiring": "due-soon",
      "insurance-expiring": "due-soon",
      "service-overdue": "overdue",
      "registration-expired": "expired",
      "insurance-expired": "expired",
      "out-of-service": "out-of-service",
    };
    for (const vehicle of vehicles) {
      const status = deriveVehicleStatus(vehicle, today);
      rows.push({
        id: vehicle._id,
        name: `${vehicle.registration} · ${vehicle.make_model}`,
        category: "vehicle",
        entity: "Western USI",
        status: VEHICLE_TO_REGISTER[status],
        label: status === "current" ? undefined : VEHICLE_STATUS_LABELS[status],
        due: [vehicle.registration_expiry, vehicle.insurance_expiry, vehicle.next_service].sort()[0],
        responsible: await nameOf(vehicle.responsible_user_id),
        vehicle: vehicle.registration,
      });
    }

    const entities = ["Western USI", ...subcontractors.map((row) => row.name).sort()];
    return { rows: rows.sort((a, b) => a.name.localeCompare(b.name)), entities, today };
  },
});

/** One line of an entity's History tab: what happened to which record, when and by whom. */
export interface HistoryEvent {
  at: number;
  category: "accreditation" | "insurance" | "first-aid" | "swms" | "sds" | "document" | "vehicle" | "agreement";
  record_id: string;
  record: string;
  what: string;
  /** Absent for what the system did itself, such as sending a reminder. */
  by?: string;
  details?: string;
}

/** The same words as each record's "Recent activity" card. */
export const HISTORY_TEXT = {
  accreditation: {
    uploaded: "Evidence uploaded",
    verified: "Verified",
    rejected: "New evidence requested",
    superseded: "Replaced by a newer upload",
    reminder_sent: "Reminder sent",
    escalated: "Escalated to management",
    edited: "Details changed",
  },
  insurance: {
    added: "Policy added",
    uploaded: "Certificate uploaded",
    verified: "Verified",
    rejected: "Replacement requested",
    superseded: "Previous certificate retained",
    reminder_sent: "Reminder sent",
    escalated: "Escalated to management",
    edited: "Details changed",
    archived: "Archived",
  },
  kit: {
    inspected: "Inspection submitted",
    resolved: "Corrective action completed",
    reminder_sent: "Reminder sent",
    escalated: "Escalated to management",
    edited: "Details changed",
    archived: "Archived",
  },
  document: {
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
  },
  vehicle: {
    added: "Vehicle added",
    serviced: "Service recorded",
    out_of_service: "Set out of service",
    returned_to_service: "Returned to service",
    reminder_sent: "Reminder sent",
    escalated: "Escalated to management",
    edited: "Details changed",
    archived: "Archived",
  },
} as const;

/**
 * An entity's History tab (framework 11, audit trail): every recorded action
 * on the records the register shows under it, newest first. For a
 * subcontractor: its workers' accreditations, its insurance, kits its workers
 * hold, and its workers' document acknowledgements. For Western USI (no
 * `subcontractor_id`): its own workers' accreditations and insurance, its kits,
 * the safety documents and the vehicles. Read-only; nothing is ever removed.
 */
export const entityHistory = query({
  args: { subcontractor_id: v.optional(v.id("subcontractors")) },
  handler: async (ctx, args): Promise<HistoryEvent[]> => {
    await requireComplianceViewer(ctx);
    const isWesternUsi = args.subcontractor_id === undefined;

    const names = new Map<Id<"users">, string>();
    const nameOf = async (id: Id<"users"> | undefined) => {
      if (id === undefined) return undefined;
      const known = names.get(id);
      if (known !== undefined) return known;
      const user = await ctx.db.get(id);
      const name = user === null ? "Removed user" : (user.name ?? user.email);
      names.set(id, name);
      return name;
    };

    // The entity's people, as the register counts them (decision R6).
    const [installers, logins] = await Promise.all([
      ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "installer")).collect(),
      ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "subcontractor")).collect(),
    ]);
    const workers = [...installers, ...logins].filter((user) => user.subcontractor_id === args.subcontractor_id);
    const workerIds = new Set(workers.map((worker) => worker._id));
    for (const worker of workers) names.set(worker._id, worker.name ?? worker.email);

    const events: HistoryEvent[] = [];
    const push = async (
      row: { _creationTime: number; action: string; actor_id?: Id<"users">; details?: string },
      category: HistoryEvent["category"],
      texts: Record<string, string>,
      record_id: string,
      record: string,
    ) => {
      events.push({
        at: row._creationTime,
        category,
        record_id,
        record,
        what: texts[row.action] ?? row.action,
        by: await nameOf(row.actor_id),
        details: row.details,
      });
    };

    // Accreditations of the entity's workers.
    const typeNames = new Map((await ctx.db.query("accreditation_types").collect()).map((type) => [type._id, type.name]));
    for (const worker of workers) {
      for (const record of await ctx.db
        .query("whs_records")
        .withIndex("by_worker", (q) => q.eq("worker_id", worker._id))
        .collect()) {
        const label = `${typeNames.get(record.type_id) ?? "Accreditation"} · ${names.get(worker._id)}`;
        for (const row of await ctx.db
          .query("whs_audit")
          .withIndex("by_record", (q) => q.eq("record_id", record._id))
          .collect()) {
          await push(row, "accreditation", HISTORY_TEXT.accreditation, record._id, label);
        }
      }
    }

    // The entity's insurance policies.
    for (const policy of await ctx.db
      .query("insurance_policies")
      .withIndex("by_subcontractor", (q) => q.eq("subcontractor_id", args.subcontractor_id))
      .collect()) {
      const label = `${INSURANCE_TYPE_LABELS[policy.insurance_type]} policy`;
      for (const row of await ctx.db
        .query("insurance_audit")
        .withIndex("by_policy", (q) => q.eq("policy_id", policy._id))
        .collect()) {
        await push(row, "insurance", HISTORY_TEXT.insurance, policy._id, label);
      }
    }

    // Kits: held by one of the entity's workers; kits held by no one are Western USI's.
    for (const kit of await ctx.db.query("first_aid_kits").collect()) {
      const held = kit.responsible_user_id === undefined ? isWesternUsi : workerIds.has(kit.responsible_user_id);
      if (!held) continue;
      for (const row of await ctx.db
        .query("kit_audit")
        .withIndex("by_kit_and_key", (q) => q.eq("kit_id", kit._id))
        .collect()) {
        await push(row, "first-aid", HISTORY_TEXT.kit, kit._id, `First-aid kit ${kit.code}`);
      }
    }

    if (isWesternUsi) {
      // Safety documents and vehicles belong to Western USI.
      for (const document of await ctx.db.query("whs_documents").collect()) {
        for (const row of await ctx.db
          .query("whs_document_audit")
          .withIndex("by_document", (q) => q.eq("document_id", document._id))
          .collect()) {
          await push(row, document.kind, HISTORY_TEXT.document, document._id, document.title);
        }
      }
      for (const vehicle of await ctx.db.query("vehicles").collect()) {
        for (const row of await ctx.db
          .query("vehicle_audit")
          .withIndex("by_vehicle", (q) => q.eq("vehicle_id", vehicle._id))
          .collect()) {
          await push(row, "vehicle", HISTORY_TEXT.vehicle, vehicle._id, `Vehicle ${vehicle.registration}`);
        }
      }
    } else {
      // The subcontractor's signed agreements (framework 4D); each upload is kept.
      const subcontractorId = args.subcontractor_id!;
      for (const agreement of await ctx.db
        .query("subcontractor_agreements")
        .withIndex("by_subcontractor", (q) => q.eq("subcontractor_id", subcontractorId))
        .collect()) {
        events.push({
          at: agreement._creationTime,
          category: "agreement",
          record_id: subcontractorId,
          record: "Signed subcontractor agreement",
          what: "Agreement uploaded",
          by: await nameOf(agreement.uploaded_by),
          details: `Signed ${agreement.signed_on}; review ${agreement.review_date}.`,
        });
      }
      // A subcontractor's workers signing safety documents (framework 4D "SWMS acknowledgements").
      for (const worker of workers) {
        for (const ack of await ctx.db
          .query("whs_acknowledgements")
          .withIndex("by_worker", (q) => q.eq("worker_id", worker._id))
          .collect()) {
          const [document, version] = await Promise.all([ctx.db.get(ack.document_id), ctx.db.get(ack.version_id)]);
          if (document === null) continue;
          events.push({
            at: ack._creationTime,
            category: document.kind,
            record_id: document._id,
            record: `${document.title}${version === null ? "" : ` · ${version.version}`}`,
            what: "Acknowledged",
            by: names.get(worker._id),
          });
        }
      }
    }

    return events.sort((a, b) => b.at - a.at);
  },
});
