import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { HISTORY_TEXT, requirePanelUser } from "./whsAdmin";
import { isValidIsoDate } from "./accreditations";
import { documentIsFor } from "./permissions";

/**
 * Data for the Reports & Exports page (framework 12) that the register itself
 * doesn't carry. The page turns each into a PDF or Excel file in the browser.
 * The register, expiring, subcontractor, matrix, insurance and missing reports
 * are built from `whsAdmin.register`.
 */

async function personName(ctx: QueryCtx, id: Id<"users"> | undefined) {
  if (id === undefined) return "";
  const user = await ctx.db.get(id);
  return user === null ? "Removed user" : (user.name ?? user.email);
}

async function entityOfUser(ctx: QueryCtx, id: Id<"users"> | undefined) {
  const user = id === undefined ? null : await ctx.db.get(id);
  if (user === null || user.subcontractor_id === undefined) return "Western USI";
  return (await ctx.db.get(user.subcontractor_id))?.name ?? "Subcontractor";
}

function checkPeriod(from: string, to: string) {
  if (!isValidIsoDate(from)) throw new ConvexError("Enter the start of the period.");
  if (!isValidIsoDate(to)) throw new ConvexError("Enter the end of the period.");
  if (from > to) throw new ConvexError("The start of the period must be on or before the end.");
}

/** Vehicle service report (framework 12): services recorded in the period. */
export const vehicleServices = query({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    await requirePanelUser(ctx);
    checkPeriod(args.from, args.to);
    const rows = [];
    for (const vehicle of await ctx.db.query("vehicles").withIndex("by_archived", (q) => q.eq("archived", false)).collect()) {
      for (const service of await ctx.db
        .query("vehicle_services")
        .withIndex("by_vehicle", (q) => q.eq("vehicle_id", vehicle._id))
        .collect()) {
        if (service.date < args.from || service.date > args.to) continue;
        rows.push({
          registration: vehicle.registration,
          make_model: vehicle.make_model,
          date: service.date,
          provider: service.provider ?? "",
          odometer: service.odometer ?? "",
          notes: service.notes ?? "",
          recorded_by: await personName(ctx, service.recorded_by),
        });
      }
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  },
});

/** First-aid inspection history (framework 12): inspections in the period, with their corrective actions. */
export const kitInspections = query({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    await requirePanelUser(ctx);
    checkPeriod(args.from, args.to);
    const rows = [];
    for (const kit of await ctx.db.query("first_aid_kits").withIndex("by_archived", (q) => q.eq("archived", false)).collect()) {
      const entity = await entityOfUser(ctx, kit.responsible_user_id);
      for (const inspection of await ctx.db
        .query("kit_inspections")
        .withIndex("by_kit", (q) => q.eq("kit_id", kit._id))
        .collect()) {
        if (inspection.date < args.from || inspection.date > args.to) continue;
        const needsAction = inspection.answers.filter((entry) => entry.answer === "action").map((entry) => entry.check);
        rows.push({
          kit: kit.code,
          kit_type: kit.kit_type,
          location: kit.location,
          entity,
          date: inspection.date,
          inspected_by: await personName(ctx, inspection.inspected_by),
          /** Check ids (the web app has their names); empty when every check passed. */
          needs_action: needsAction,
          items_replaced: inspection.items_replaced ?? "",
          earliest_expiry: inspection.earliest_expiry,
          corrective_action: inspection.corrective_action ?? "",
          resolved:
            needsAction.length === 0
              ? ""
              : inspection.resolved_at === undefined
                ? "Open"
                : `Resolved by ${await personName(ctx, inspection.resolved_by)}${inspection.resolution ? `: ${inspection.resolution}` : ""}`,
        });
      }
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  },
});

/**
 * SWMS acknowledgement report (framework 12): every installer against the
 * current version of each SWMS that needs acknowledging (decision D9).
 */
export const swmsAcknowledgements = query({
  args: {},
  handler: async (ctx) => {
    await requirePanelUser(ctx);
    const installers = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "installer")).collect();
    const entities = new Map<string, string>();
    for (const installer of installers) entities.set(installer._id, await entityOfUser(ctx, installer._id));

    const rows = [];
    for (const document of await ctx.db.query("whs_documents").withIndex("by_kind", (q) => q.eq("kind", "swms")).collect()) {
      if (document.archived || !document.acknowledgement_required) continue;
      const current = (
        await ctx.db
          .query("whs_document_versions")
          .withIndex("by_document", (q) => q.eq("document_id", document._id))
          .collect()
      ).find((version) => version.state === "current");
      if (current === undefined) continue;
      const signed = new Map(
        (
          await ctx.db
            .query("whs_acknowledgements")
            .withIndex("by_version_and_worker", (q) => q.eq("version_id", current._id))
            .collect()
        ).map((ack) => [ack.worker_id, ack._creationTime]),
      );
      for (const installer of installers) {
        if (!documentIsFor(document, installer)) continue;
        rows.push({
          document_id: document._id,
          document: document.title,
          version: current.version,
          issued: current.issued,
          worker: installer.name ?? installer.email,
          entity: entities.get(installer._id) ?? "Western USI",
          signed_at: signed.get(installer._id),
        });
      }
    }
    return rows.sort((a, b) => a.document.localeCompare(b.document) || a.worker.localeCompare(b.worker));
  },
});

/** Audit history for a selected record (framework 11, 12): every recorded action, oldest first. */
export const recordHistory = query({
  args: {
    category: v.union(
      v.literal("accreditation"),
      v.literal("swms"),
      v.literal("sds"),
      v.literal("document"),
      v.literal("first-aid"),
      v.literal("insurance"),
      v.literal("vehicle"),
    ),
    id: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePanelUser(ctx);
    const notFound = () => new ConvexError("That record no longer exists. Select another one.");
    let trail: { _creationTime: number; action: string; actor_id?: Id<"users">; details?: string }[];
    let texts: Record<string, string>;

    if (args.category === "accreditation") {
      const id = ctx.db.normalizeId("whs_records", args.id);
      if (id === null) throw new ConvexError("This accreditation has no evidence yet, so it has no history.");
      trail = await ctx.db.query("whs_audit").withIndex("by_record", (q) => q.eq("record_id", id)).collect();
      texts = HISTORY_TEXT.accreditation;
    } else if (args.category === "insurance") {
      const id = ctx.db.normalizeId("insurance_policies", args.id);
      if (id === null) throw notFound();
      trail = await ctx.db.query("insurance_audit").withIndex("by_policy", (q) => q.eq("policy_id", id)).collect();
      texts = HISTORY_TEXT.insurance;
    } else if (args.category === "first-aid") {
      const id = ctx.db.normalizeId("first_aid_kits", args.id);
      if (id === null) throw notFound();
      trail = await ctx.db.query("kit_audit").withIndex("by_kit_and_key", (q) => q.eq("kit_id", id)).collect();
      texts = HISTORY_TEXT.kit;
    } else if (args.category === "vehicle") {
      const id = ctx.db.normalizeId("vehicles", args.id);
      if (id === null) throw notFound();
      trail = await ctx.db.query("vehicle_audit").withIndex("by_vehicle", (q) => q.eq("vehicle_id", id)).collect();
      texts = HISTORY_TEXT.vehicle;
    } else {
      const id = ctx.db.normalizeId("whs_documents", args.id);
      if (id === null) throw notFound();
      trail = await ctx.db.query("whs_document_audit").withIndex("by_document", (q) => q.eq("document_id", id)).collect();
      texts = HISTORY_TEXT.document;
    }

    const rows = [];
    for (const row of trail.sort((a, b) => a._creationTime - b._creationTime)) {
      rows.push({
        at: row._creationTime,
        what: texts[row.action] ?? row.action,
        by: row.actor_id === undefined ? "System" : await personName(ctx, row.actor_id),
        details: row.details ?? "",
      });
    }
    return rows;
  },
});
