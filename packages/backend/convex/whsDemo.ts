import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation } from "./_generated/server";
import { placeholderPdf } from "./documents";
import { addDays, addMonths, businessToday } from "./whsDates";

/**
 * Dummy accreditations and kits for the real dev accounts, so the admin
 * register and dashboard can be tested (the user asked for it on 15 Oct).
 * Development only: run with reminders off (WHS_REMINDERS_OFF=true).
 * Skips anything that already exists, so it is safe to run again:
 *   npx convex run whsDemo:seed
 */

type Plan = "current" | "due-soon" | "expired" | "awaiting" | "renewal" | "rejected";

/** Per worker (by email): accreditation type -> what to create. Types not listed stay Missing. */
const PLAN: Record<string, Record<string, Plan>> = {
  "installer@usi.com": { "White Card": "current", "First Aid": "due-soon", "Working at Heights": "expired", "RIW Card": "awaiting" },
  "installer2@usi.com": { "White Card": "current", "First Aid": "expired", "PTA Induction": "renewal", "EWP Licence": "rejected" },
  "faaridqureshi@gmail.com": { "White Card": "current", "Driver's Licence": "due-soon", "Working at Heights": "current" },
  "k230682@nu.edu.pk": { "White Card": "awaiting", "First Aid": "current" },
  "areebrehman615@gmail.com": { "White Card": "current", "RIW Card": "due-soon" },
  "k224139@nu.edu.pk": { "White Card": "current", "First Aid": "expired", "PTA Induction": "awaiting" },
  "umaraurangzeb03@gmail.com": { "White Card": "current", "Working at Heights": "rejected" },
};

const KITS = [
  { code: "V-08", kit_type: "Vehicle kit", location: "Vehicle 1EAB119", email: "installer2@usi.com", nextInDays: -14 },
  { code: "W-02", kit_type: "Warehouse kit", location: "Osborne Park warehouse", email: "faaridqureshi@gmail.com", nextInDays: 60 },
  { code: "V-09", kit_type: "Vehicle kit", location: "Vehicle 1CPQ803", email: "areebrehman615@gmail.com", nextInDays: 9 },
];

export const seed = internalAction({
  args: {},
  handler: async (ctx): Promise<{ accreditations: number; kits: number }> => {
    const fileId = await ctx.storage.store(placeholderPdf("Demo evidence"));
    return await ctx.runMutation(internal.whsDemo.insert, { file_id: fileId });
  },
});

export const insert = internalMutation({
  args: { file_id: v.id("_storage") },
  handler: async (ctx, args) => {
    const today = businessToday();
    const users = await ctx.db.query("users").collect();
    const admin = users.find((user) => user.role === "admin");
    if (admin === undefined) throw new Error("No admin account to record as the verifier.");
    const types = await ctx.db.query("accreditation_types").collect();

    let accreditations = 0;
    for (const [email, plan] of Object.entries(PLAN)) {
      const worker = users.find((user) => user.email.toLowerCase() === email);
      if (worker === undefined) continue;

      for (const [typeName, kind] of Object.entries(plan)) {
        const type = types.find((entry) => entry.name === typeName);
        if (type === undefined) continue;
        const existing = await ctx.db
          .query("whs_records")
          .withIndex("by_worker_and_type", (q) => q.eq("worker_id", worker._id).eq("type_id", type._id))
          .unique();
        if (existing !== null) continue;

        const recordId = await ctx.db.insert("whs_records", {
          category: "accreditation",
          worker_id: worker._id,
          type_id: type._id,
          responsible_user_id: worker._id,
        });
        const base = {
          record_id: recordId,
          file_id: args.file_id,
          file_name: `${typeName} (demo).pdf`,
          content_type: "application/pdf",
          number: `DEMO-${Math.floor(Math.random() * 90000) + 10000}`,
          no_expiry: false,
          uploaded_by: worker._id,
          notes: "Dummy data for testing",
        };
        const verified = (expires: string) => ({
          ...base,
          issued: addDays(expires, -1095),
          expires,
          state: "verified" as const,
          verified_by: admin._id as Id<"users">,
          verified_at: Date.now() - 200 * 24 * 60 * 60 * 1000,
        });

        if (kind === "current") await ctx.db.insert("whs_record_versions", verified(addDays(today, 400)));
        if (kind === "due-soon") await ctx.db.insert("whs_record_versions", verified(addDays(today, 20)));
        if (kind === "expired") await ctx.db.insert("whs_record_versions", verified(addDays(today, -12)));
        if (kind === "awaiting") {
          await ctx.db.insert("whs_record_versions", { ...base, issued: addDays(today, -5), expires: addDays(today, 1090), state: "pending" });
        }
        if (kind === "renewal") {
          await ctx.db.insert("whs_record_versions", verified(addDays(today, 15)));
          await ctx.db.insert("whs_record_versions", { ...base, issued: addDays(today, -2), expires: addDays(today, 1093), state: "pending" });
        }
        if (kind === "rejected") {
          await ctx.db.insert("whs_record_versions", {
            ...base,
            issued: addDays(today, -6),
            expires: addDays(today, 1000),
            state: "rejected",
            rejected_reason: "The photo is blurry; upload a clearer copy.",
          });
        }
        accreditations++;
      }
    }

    let kits = 0;
    const existingKits = await ctx.db.query("first_aid_kits").collect();
    for (const kit of KITS) {
      if (existingKits.some((entry) => entry.code === kit.code)) continue;
      const responsible = users.find((user) => user.email.toLowerCase() === kit.email);
      await ctx.db.insert("first_aid_kits", {
        code: kit.code,
        kit_type: kit.kit_type,
        location: kit.location,
        responsible_user_id: responsible?._id,
        frequency_months: 3,
        next_inspection: addDays(today, kit.nextInDays),
        notes: "Dummy data for testing",
        archived: false,
      });
      kits++;
    }

    return { accreditations, kits };
  },
});

/** Dummy insurance policies and vehicles for testing (same rules as `seed`): `npx convex run whsDemo:seedAssets` */
export const seedAssets = internalAction({
  args: {},
  handler: async (ctx): Promise<{ policies: number; vehicles: number }> => {
    const fileId = await ctx.storage.store(placeholderPdf("Demo certificate"));
    return await ctx.runMutation(internal.whsDemo.insertAssets, { file_id: fileId });
  },
});

export const insertAssets = internalMutation({
  args: { file_id: v.id("_storage") },
  handler: async (ctx, args) => {
    const today = businessToday();
    const admin = (await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "admin")).first());
    if (admin === null) throw new Error("No admin account to record as the verifier.");
    const subcontractors = await ctx.db.query("subcontractors").collect();
    const sub = (name: string) => subcontractors.find((row) => row.name === name)?._id;

    const POLICIES: {
      entity?: string;
      type: "workers_compensation" | "public_liability" | "motor_vehicle" | "professional_indemnity";
      insurer: string;
      coverage: string;
      expiresIn: number;
    }[] = [
      { type: "public_liability", insurer: "QBE", coverage: "$20,000,000", expiresIn: 220 },
      { type: "workers_compensation", insurer: "icare", coverage: "Statutory", expiresIn: 40 },
      { type: "motor_vehicle", insurer: "NRMA", coverage: "Comprehensive", expiresIn: 160 },
      { entity: "Umar Industries", type: "public_liability", insurer: "Allianz", coverage: "$10,000,000", expiresIn: -20 },
      { entity: "Umar Industries", type: "workers_compensation", insurer: "Allianz", coverage: "Statutory", expiresIn: 300 },
      { entity: "Smith Installations", type: "public_liability", insurer: "CGU", coverage: "$5,000,000", expiresIn: 25 },
    ];
    let policies = 0;
    for (const entry of POLICIES) {
      const subcontractorId = entry.entity === undefined ? undefined : sub(entry.entity);
      if (entry.entity !== undefined && subcontractorId === undefined) continue;
      const existing = (
        await ctx.db.query("insurance_policies").withIndex("by_subcontractor", (q) => q.eq("subcontractor_id", subcontractorId)).collect()
      ).find((policy) => policy.insurance_type === entry.type);
      if (existing) continue;
      const policyId = await ctx.db.insert("insurance_policies", {
        subcontractor_id: subcontractorId,
        insurance_type: entry.type,
        insurer: entry.insurer,
        coverage: entry.coverage,
        notes: "Dummy data for testing",
        archived: false,
      });
      const expires = addDays(today, entry.expiresIn);
      await ctx.db.insert("insurance_certificates", {
        policy_id: policyId,
        start: addDays(expires, -365),
        expires,
        file_id: args.file_id,
        file_name: "Certificate of currency (demo).pdf",
        content_type: "application/pdf",
        uploaded_by: admin._id,
        state: "verified",
        verified_by: admin._id,
        verified_at: Date.now() - 300 * 24 * 60 * 60 * 1000,
      });
      await ctx.db.insert("insurance_audit", { policy_id: policyId, action: "added", actor_id: admin._id, details: "Dummy data for testing" });
      policies++;
    }

    const VEHICLES = [
      { registration: "1DXK442", make_model: "Toyota Hilux", year: 2022, regoIn: 210, insuranceIn: 250, lastServiceAgo: 165, out: false },
      { registration: "1EAB119", make_model: "Ford Transit", year: 2020, regoIn: -9, insuranceIn: 250, lastServiceAgo: 60, out: false },
      { registration: "1CPQ803", make_model: "Hyundai iLoad", year: 2019, regoIn: 150, insuranceIn: 250, lastServiceAgo: 200, out: true },
      { registration: "1HXR552", make_model: "Toyota HiAce", year: 2021, regoIn: 300, insuranceIn: 250, lastServiceAgo: 30, out: false },
    ];
    let vehicles = 0;
    for (const entry of VEHICLES) {
      const existing = await ctx.db.query("vehicles").withIndex("by_registration", (q) => q.eq("registration", entry.registration)).first();
      if (existing !== null) continue;
      const lastService = addDays(today, -entry.lastServiceAgo);
      const vehicleId = await ctx.db.insert("vehicles", {
        registration: entry.registration,
        make_model: entry.make_model,
        year: entry.year,
        registration_expiry: addDays(today, entry.regoIn),
        insurance_expiry: addDays(today, entry.insuranceIn),
        last_service: lastService,
        service_interval_months: 6,
        next_service: addMonths(lastService, 6),
        service_provider: "Osborne Park Auto",
        out_of_service: entry.out,
        out_of_service_reason: entry.out ? "Mechanical issue — repairs pending (demo)" : undefined,
        notes: "Dummy data for testing",
        archived: false,
      });
      await ctx.db.insert("vehicle_audit", { vehicle_id: vehicleId, action: "added", actor_id: admin._id, details: "Dummy data for testing" });
      vehicles++;
    }
    return { policies, vehicles };
  },
});

/**
 * Cuts the dummy data back to one example of each status (asked 15 Oct).
 * Only touches records marked "Dummy data for testing" or the sample
 * documents `documents:seedSamples` added:
 *   npx convex run whsDemo:trim
 */
export const trim = internalMutation({
  args: {},
  handler: async (ctx) => {
    const removed = { accreditations: 0, kits: 0, policies: 0, vehicles: 0, documents: 0 };
    const users = await ctx.db.query("users").collect();
    const byEmail = (email: string) => users.find((user) => user.email.toLowerCase() === email);
    const types = await ctx.db.query("accreditation_types").collect();

    const DROP_ACCREDITATIONS: [string, string][] = [
      ["installer@usi.com", "White Card"],
      ["installer@usi.com", "RIW Card"],
      ["installer2@usi.com", "First Aid"],
      ["faaridqureshi@gmail.com", "White Card"],
      ["faaridqureshi@gmail.com", "Driver's Licence"],
      ["faaridqureshi@gmail.com", "Working at Heights"],
      ["k230682@nu.edu.pk", "First Aid"],
      ["areebrehman615@gmail.com", "White Card"],
      ["areebrehman615@gmail.com", "RIW Card"],
      ["umaraurangzeb03@gmail.com", "White Card"],
      ["umaraurangzeb03@gmail.com", "Working at Heights"],
    ];
    for (const [email, typeName] of DROP_ACCREDITATIONS) {
      const worker = byEmail(email);
      const type = types.find((entry) => entry.name === typeName);
      if (!worker || !type) continue;
      const record = await ctx.db
        .query("whs_records")
        .withIndex("by_worker_and_type", (q) => q.eq("worker_id", worker._id).eq("type_id", type._id))
        .unique();
      if (record === null) continue;
      const versions = await ctx.db.query("whs_record_versions").withIndex("by_record", (q) => q.eq("record_id", record._id)).collect();
      if (!versions.some((version) => version.notes === "Dummy data for testing")) continue;
      for (const version of versions) await ctx.db.delete(version._id);
      for (const row of await ctx.db.query("whs_audit").withIndex("by_record", (q) => q.eq("record_id", record._id)).collect()) {
        await ctx.db.delete(row._id);
      }
      await ctx.db.delete(record._id);
      removed.accreditations++;
    }

    for (const kit of await ctx.db.query("first_aid_kits").collect()) {
      if (kit.notes !== "Dummy data for testing" || !["W-02", "V-09"].includes(kit.code)) continue;
      for (const row of await ctx.db.query("kit_inspections").withIndex("by_kit", (q) => q.eq("kit_id", kit._id)).collect()) await ctx.db.delete(row._id);
      for (const row of await ctx.db.query("kit_audit").withIndex("by_kit_and_key", (q) => q.eq("kit_id", kit._id)).collect()) await ctx.db.delete(row._id);
      await ctx.db.delete(kit._id);
      removed.kits++;
    }

    const subcontractors = await ctx.db.query("subcontractors").collect();
    const umar = subcontractors.find((row) => row.name === "Umar Industries")?._id;
    for (const policy of await ctx.db.query("insurance_policies").collect()) {
      if (policy.notes !== "Dummy data for testing") continue;
      const drop =
        (policy.subcontractor_id === undefined && policy.insurance_type !== "public_liability") ||
        (policy.subcontractor_id === umar && policy.insurance_type === "workers_compensation");
      if (!drop) continue;
      for (const row of await ctx.db.query("insurance_certificates").withIndex("by_policy", (q) => q.eq("policy_id", policy._id)).collect()) await ctx.db.delete(row._id);
      for (const row of await ctx.db.query("insurance_audit").withIndex("by_policy", (q) => q.eq("policy_id", policy._id)).collect()) await ctx.db.delete(row._id);
      await ctx.db.delete(policy._id);
      removed.policies++;
    }

    for (const vehicle of await ctx.db.query("vehicles").collect()) {
      if (vehicle.notes !== "Dummy data for testing" || vehicle.registration !== "1HXR552") continue;
      for (const row of await ctx.db.query("vehicle_services").withIndex("by_vehicle", (q) => q.eq("vehicle_id", vehicle._id)).collect()) await ctx.db.delete(row._id);
      for (const row of await ctx.db.query("vehicle_audit").withIndex("by_vehicle", (q) => q.eq("vehicle_id", vehicle._id)).collect()) await ctx.db.delete(row._id);
      await ctx.db.delete(vehicle._id);
      removed.vehicles++;
    }

    const DROP_DOCUMENTS = ["Airport Installation", "JCDecaux Site Safety Management Plan", "WHS Management System", "Contact Adhesive Spray"];
    for (const document of await ctx.db.query("whs_documents").collect()) {
      if (!DROP_DOCUMENTS.includes(document.title)) continue;
      const versions = await ctx.db.query("whs_document_versions").withIndex("by_document", (q) => q.eq("document_id", document._id)).collect();
      for (const version of versions) {
        for (const ack of await ctx.db.query("whs_acknowledgements").withIndex("by_version_and_worker", (q) => q.eq("version_id", version._id)).collect()) await ctx.db.delete(ack._id);
        for (const change of await ctx.db.query("swms_changes").withIndex("by_version", (q) => q.eq("version_id", version._id)).collect()) {
          for (const signoff of await ctx.db.query("swms_change_signoffs").withIndex("by_change", (q) => q.eq("change_id", change._id)).collect()) await ctx.db.delete(signoff._id);
          await ctx.db.delete(change._id);
        }
        await ctx.db.delete(version._id);
      }
      for (const concern of await ctx.db.query("whs_concerns").withIndex("by_document", (q) => q.eq("document_id", document._id)).collect()) await ctx.db.delete(concern._id);
      for (const row of await ctx.db.query("whs_document_audit").withIndex("by_document", (q) => q.eq("document_id", document._id)).collect()) await ctx.db.delete(row._id);
      await ctx.db.delete(document._id);
      removed.documents++;
    }
    return removed;
  },
});
