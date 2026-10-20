import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { isValidIsoDate, requireCaller } from "./accreditations";
import { canViewCompliance, isAdminUser } from "./permissions";
import { addMonths, businessToday } from "./whsDates";
import { daysBetween } from "./whsStatus";
import { checkReason, describeEdit } from "./whsEdits";

/**
 * The vehicle register (framework 4E): Western USI vehicles only (decision
 * VH4), kept by admin staff, services recorded by the office (VH2).
 */

/** Framework 7: registration 60, 30, 14, 7 days before expiry; service 30, 14, 7 before it's due. */
export const REGISTRATION_REMINDER_DAYS = [60, 30, 14, 7];
export const SERVICE_REMINDER_DAYS = [30, 14, 7];
export const INSURANCE_REMINDER_DAYS = [60, 30, 14, 7];

export type VehicleStatus =
  | "current"
  | "service-due-soon"
  | "service-overdue"
  | "registration-expiring"
  | "registration-expired"
  | "insurance-expiring"
  | "insurance-expired"
  | "out-of-service";

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  current: "Current",
  "service-due-soon": "Service due soon",
  "service-overdue": "Service overdue",
  "registration-expiring": "Registration expiring",
  "registration-expired": "Registration expired",
  "insurance-expiring": "Insurance expiring",
  "insurance-expired": "Insurance expired",
  "out-of-service": "Out of service",
};

/**
 * The one status shown for a vehicle (framework 4E's list), the most urgent
 * first. "Insurance expired" is added: 4E lists only "Insurance expiring".
 */
export function deriveVehicleStatus(vehicle: Doc<"vehicles">, today: string): VehicleStatus {
  if (vehicle.out_of_service) return "out-of-service";
  const left = (date: string) => daysBetween(today, date);
  if (left(vehicle.registration_expiry) < 0) return "registration-expired";
  if (left(vehicle.insurance_expiry) < 0) return "insurance-expired";
  if (left(vehicle.next_service) < 0) return "service-overdue";
  if (left(vehicle.registration_expiry) <= Math.max(...REGISTRATION_REMINDER_DAYS)) return "registration-expiring";
  if (left(vehicle.next_service) <= Math.max(...SERVICE_REMINDER_DAYS)) return "service-due-soon";
  if (left(vehicle.insurance_expiry) <= Math.max(...INSURANCE_REMINDER_DAYS)) return "insurance-expiring";
  return "current";
}

async function requirePanel(ctx: QueryCtx) {
  const user = await requireCaller(ctx);
  if (!canViewCompliance(user)) throw new ConvexError("Only admins and management can open this.");
  return user;
}

async function requireAdmin(ctx: QueryCtx) {
  const user = await requireCaller(ctx);
  if (!isAdminUser(user)) throw new ConvexError("Only an administrator can manage vehicles.");
  return user;
}

async function nameOf(ctx: QueryCtx, id: Id<"users"> | undefined) {
  if (id === undefined) return undefined;
  const user = await ctx.db.get(id);
  return user === null ? "Unknown" : (user.name ?? user.email);
}

function checkDate(value: string, label: string) {
  if (!isValidIsoDate(value)) throw new ConvexError(`Select a valid ${label}.`);
}

function checkInterval(months: number) {
  if (!(Number.isInteger(months) && months >= 1 && months <= 24)) throw new ConvexError("Select the service interval (1 to 24 months).");
}

function text(value: string | undefined, label: string, max = 200) {
  const trimmed = value?.trim() || undefined;
  if (trimmed !== undefined && trimmed.length > max) throw new ConvexError(`${label} can be up to ${max} characters.`);
  return trimmed;
}

async function audit(ctx: MutationCtx, entry: Omit<Doc<"vehicle_audit">, "_id" | "_creationTime">) {
  await ctx.db.insert("vehicle_audit", entry);
}

/** A one-off URL for a service invoice or report. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

function summary(vehicle: Doc<"vehicles">, today: string) {
  const status = deriveVehicleStatus(vehicle, today);
  return {
    id: vehicle._id,
    registration: vehicle.registration,
    make_model: vehicle.make_model,
    year: vehicle.year,
    vin: vehicle.vin,
    registration_expiry: vehicle.registration_expiry,
    insurance_expiry: vehicle.insurance_expiry,
    last_service: vehicle.last_service,
    next_service: vehicle.next_service,
    service_interval_months: vehicle.service_interval_months,
    service_provider: vehicle.service_provider,
    out_of_service: vehicle.out_of_service,
    out_of_service_reason: vehicle.out_of_service_reason,
    status,
    status_label: VEHICLE_STATUS_LABELS[status],
  };
}

/** Every vehicle for the Vehicle Register. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requirePanel(ctx);
    const today = businessToday();
    const vehicles = await ctx.db.query("vehicles").withIndex("by_archived", (q) => q.eq("archived", false)).collect();
    return vehicles.map((vehicle) => summary(vehicle, today)).sort((a, b) => a.registration.localeCompare(b.registration));
  },
});

/** One vehicle with its services and activity. */
export const adminDetail = query({
  args: { vehicle_id: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requirePanel(ctx);
    const vehicleId = ctx.db.normalizeId("vehicles", args.vehicle_id);
    const vehicle = vehicleId === null ? null : await ctx.db.get(vehicleId);
    // An archived vehicle still opens, read-only, so its history stays reachable (framework 11).
    if (vehicle === null) return null;

    const services = await ctx.db
      .query("vehicle_services")
      .withIndex("by_vehicle", (q) => q.eq("vehicle_id", vehicle._id))
      .order("desc")
      .take(10);
    const trail = await ctx.db
      .query("vehicle_audit")
      .withIndex("by_vehicle", (q) => q.eq("vehicle_id", vehicle._id))
      .order("desc")
      .take(20);
    const latest = services[0];

    return {
      ...summary(vehicle, businessToday()),
      responsible: await nameOf(ctx, vehicle.responsible_user_id),
      responsible_id: vehicle.responsible_user_id,
      notes: vehicle.notes,
      archived: vehicle.archived,
      can_manage: isAdminUser(viewer) && !vehicle.archived,
      latest_file:
        latest?.file_id === undefined ? null : { name: latest.file_name ?? "Service report", url: await ctx.storage.getUrl(latest.file_id) },
      services: await Promise.all(
        services.map(async (service) => ({
          date: service.date,
          provider: service.provider,
          odometer: service.odometer,
          notes: service.notes,
          by: await nameOf(ctx, service.recorded_by),
        })),
      ),
      activity: await Promise.all(
        trail.map(async (row) => ({ at: row._creationTime, action: row.action, by: await nameOf(ctx, row.actor_id), details: row.details })),
      ),
    };
  },
});

/** The admin adds a vehicle (Figma F5, framework 4E). The next service is worked out. */
export const adminCreate = mutation({
  args: {
    registration: v.string(),
    make_model: v.string(),
    year: v.optional(v.number()),
    vin: v.optional(v.string()),
    registration_expiry: v.string(),
    insurance_expiry: v.string(),
    last_service: v.string(),
    service_interval_months: v.number(),
    service_provider: v.optional(v.string()),
    responsible_user_id: v.optional(v.id("users")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const registration = args.registration.trim().toUpperCase();
    if (registration === "") throw new ConvexError("Enter the registration number.");
    const makeModel = text(args.make_model, "Make / model");
    if (makeModel === undefined) throw new ConvexError("Enter the make and model.");
    if (args.year !== undefined && !(Number.isInteger(args.year) && args.year >= 1950 && args.year <= 2100)) {
      throw new ConvexError("Enter a four-digit year, e.g. 2021.");
    }
    checkDate(args.registration_expiry, "registration expiry");
    checkDate(args.insurance_expiry, "insurance expiry");
    checkDate(args.last_service, "last service date");
    if (args.last_service > businessToday()) throw new ConvexError("The last service date can't be in the future.");
    checkInterval(args.service_interval_months);

    const existing = await ctx.db
      .query("vehicles")
      .withIndex("by_registration", (q) => q.eq("registration", registration))
      .first();
    if (existing !== null && !existing.archived) throw new ConvexError(`Vehicle ${registration} is already in the register.`);

    const vehicleId = await ctx.db.insert("vehicles", {
      registration,
      make_model: makeModel,
      year: args.year,
      vin: text(args.vin, "The VIN"),
      registration_expiry: args.registration_expiry,
      insurance_expiry: args.insurance_expiry,
      last_service: args.last_service,
      service_interval_months: args.service_interval_months,
      next_service: addMonths(args.last_service, args.service_interval_months),
      service_provider: text(args.service_provider, "The service provider"),
      responsible_user_id: args.responsible_user_id,
      out_of_service: false,
      notes: text(args.notes, "Notes", 1000),
      archived: false,
    });
    await audit(ctx, { vehicle_id: vehicleId, action: "added", actor_id: admin._id });
    return vehicleId;
  },
});

/**
 * "Mark service complete" (framework 8): enter the date, optionally the
 * invoice; the next service is worked out and the vehicle returns to Current,
 * so an out-of-service vehicle can be used again (decision AD38).
 * Registration and insurance are unchanged.
 */
export const adminRecordService = mutation({
  args: {
    vehicle_id: v.id("vehicles"),
    date: v.string(),
    provider: v.string(),
    service_interval_months: v.number(),
    odometer: v.optional(v.string()),
    notes: v.optional(v.string()),
    responsible_user_id: v.optional(v.id("users")),
    file_id: v.optional(v.id("_storage")),
    file_name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const vehicle = await ctx.db.get(args.vehicle_id);
    if (vehicle === null || vehicle.archived) throw new ConvexError("That vehicle no longer exists.");
    checkDate(args.date, "service date");
    if (args.date > businessToday()) throw new ConvexError("The service date can't be in the future.");
    const provider = text(args.provider, "The service provider");
    if (provider === undefined) throw new ConvexError("Enter the service provider.");
    checkInterval(args.service_interval_months);
    if (args.file_id !== undefined && (await ctx.db.system.get(args.file_id)) === null) {
      throw new ConvexError("The file didn't finish uploading. Please try again.");
    }

    const next = addMonths(args.date, args.service_interval_months);
    await ctx.db.insert("vehicle_services", {
      vehicle_id: vehicle._id,
      date: args.date,
      provider,
      odometer: text(args.odometer, "The odometer"),
      notes: text(args.notes, "Service notes", 1000),
      file_id: args.file_id,
      file_name: args.file_name,
      recorded_by: admin._id,
    });
    await ctx.db.patch(vehicle._id, {
      last_service: args.date,
      service_interval_months: args.service_interval_months,
      next_service: next,
      service_provider: provider,
      out_of_service: false,
      out_of_service_reason: undefined,
      ...(args.responsible_user_id !== undefined ? { responsible_user_id: args.responsible_user_id } : {}),
    });
    await audit(ctx, { vehicle_id: vehicle._id, action: "serviced", actor_id: admin._id, details: `Serviced ${args.date}; next service ${next}.` });
    if (vehicle.out_of_service) {
      await audit(ctx, { vehicle_id: vehicle._id, action: "returned_to_service", actor_id: admin._id, details: "Service complete." });
    }
    return { next_service: next };
  },
});

/** Sets a vehicle Out of service, or returns it, with a reason (Figma D4, framework 6). */
export const adminSetAvailability = mutation({
  args: { vehicle_id: v.id("vehicles"), out_of_service: v.boolean(), reason: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const vehicle = await ctx.db.get(args.vehicle_id);
    if (vehicle === null || vehicle.archived) throw new ConvexError("That vehicle no longer exists.");
    const reason = text(args.reason, "The reason", 500);
    if (reason === undefined) throw new ConvexError("Enter the reason.");
    if (vehicle.out_of_service === args.out_of_service) {
      throw new ConvexError(args.out_of_service ? "This vehicle is already out of service." : "This vehicle is already in service.");
    }
    await ctx.db.patch(vehicle._id, { out_of_service: args.out_of_service, out_of_service_reason: args.out_of_service ? reason : undefined });
    await audit(ctx, {
      vehicle_id: vehicle._id,
      action: args.out_of_service ? "out_of_service" : "returned_to_service",
      actor_id: admin._id,
      details: reason,
    });
  },
});

/**
 * The admin corrects a vehicle's details with a reason (framework 11,
 * decision AD32). Changing the last service or the interval works out the
 * next service again.
 */
export const adminEdit = mutation({
  args: {
    vehicle_id: v.id("vehicles"),
    registration: v.string(),
    make_model: v.string(),
    year: v.optional(v.number()),
    vin: v.optional(v.string()),
    registration_expiry: v.string(),
    insurance_expiry: v.string(),
    last_service: v.string(),
    service_interval_months: v.number(),
    service_provider: v.optional(v.string()),
    responsible_user_id: v.union(v.id("users"), v.null()),
    notes: v.optional(v.string()),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const vehicle = await ctx.db.get(args.vehicle_id);
    if (vehicle === null || vehicle.archived) throw new ConvexError("That vehicle no longer exists.");
    const reason = checkReason(args.reason);
    const registration = args.registration.trim().toUpperCase();
    if (registration === "") throw new ConvexError("Enter the registration number.");
    const makeModel = text(args.make_model, "Make / model");
    if (makeModel === undefined) throw new ConvexError("Enter the make and model.");
    if (args.year !== undefined && !(Number.isInteger(args.year) && args.year >= 1950 && args.year <= 2100)) {
      throw new ConvexError("Enter a four-digit year, e.g. 2021.");
    }
    checkDate(args.registration_expiry, "registration expiry");
    checkDate(args.insurance_expiry, "insurance expiry");
    checkDate(args.last_service, "last service date");
    if (args.last_service > businessToday()) throw new ConvexError("The last service date can't be in the future.");
    checkInterval(args.service_interval_months);
    if (registration !== vehicle.registration) {
      const taken = await ctx.db
        .query("vehicles")
        .withIndex("by_registration", (q) => q.eq("registration", registration))
        .first();
      if (taken !== null && !taken.archived) throw new ConvexError(`Vehicle ${registration} is already in the register.`);
    }
    if (args.responsible_user_id !== null && (await ctx.db.get(args.responsible_user_id)) === null) {
      throw new ConvexError("That responsible person no longer exists. Choose someone else.");
    }

    const next = {
      registration,
      make_model: makeModel,
      year: args.year,
      vin: text(args.vin, "The VIN"),
      registration_expiry: args.registration_expiry,
      insurance_expiry: args.insurance_expiry,
      last_service: args.last_service,
      service_interval_months: args.service_interval_months,
      next_service: addMonths(args.last_service, args.service_interval_months),
      service_provider: text(args.service_provider, "The service provider"),
      responsible_user_id: args.responsible_user_id ?? undefined,
      notes: text(args.notes, "Notes", 1000),
    };
    const details = describeEdit(
      [
        { label: "Registration", before: vehicle.registration, after: next.registration },
        { label: "Make / model", before: vehicle.make_model, after: next.make_model },
        { label: "Year", before: vehicle.year, after: next.year },
        { label: "VIN", before: vehicle.vin, after: next.vin },
        { label: "Registration expiry", before: vehicle.registration_expiry, after: next.registration_expiry, kind: "date" },
        { label: "Insurance expiry", before: vehicle.insurance_expiry, after: next.insurance_expiry, kind: "date" },
        { label: "Last service", before: vehicle.last_service, after: next.last_service, kind: "date" },
        { label: "Service interval (months)", before: vehicle.service_interval_months, after: next.service_interval_months },
        { label: "Service provider", before: vehicle.service_provider, after: next.service_provider },
        {
          label: "Responsible person",
          before: await nameOf(ctx, vehicle.responsible_user_id),
          after: await nameOf(ctx, next.responsible_user_id),
        },
        { label: "Notes", before: vehicle.notes, after: next.notes, kind: "long" },
      ],
      reason,
    );
    await ctx.db.patch(vehicle._id, next);
    await audit(ctx, { vehicle_id: vehicle._id, action: "edited", actor_id: admin._id, details });
  },
});

/** The admin archives a vehicle that is no longer used, with a reason. It is kept, never deleted (framework 11). */
export const adminArchive = mutation({
  args: { vehicle_id: v.id("vehicles"), reason: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const vehicle = await ctx.db.get(args.vehicle_id);
    if (vehicle === null || vehicle.archived) throw new ConvexError("That vehicle is already archived.");
    const reason = checkReason(args.reason, "archive");
    await ctx.db.patch(vehicle._id, { archived: true });
    await audit(ctx, { vehicle_id: vehicle._id, action: "archived", actor_id: admin._id, details: reason });
  },
});
