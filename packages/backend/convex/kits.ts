import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import { isValidIsoDate, requireCaller } from "./accreditations";
import { canViewCompliance, isAdminUser } from "./permissions";
import { addMonths, businessToday } from "./whsDates";
import { checkReason, describeEdit } from "./whsEdits";
import { daysBetween } from "./whsStatus";

/**
 * First-aid kits and their inspections (WHS framework 4F, 8). No admin review
 * (decision K1): on submit the next date is set, and the kit is Action
 * required only while an issue is unresolved. The installer marks an issue
 * resolved, and the next date stays as scheduled (K3).
 */

/** The eight checks of framework 4F. The app shows its own wording and icons for each id. */
export const KIT_CHECK_IDS = ["present", "case", "contents", "expired", "replenished", "sterile", "emergency", "clean"];

/** Decision K2: every 3 months unless the kit says otherwise. */
export const DEFAULT_FREQUENCY_MONTHS = 3;

/** Framework 7: first-aid inspections are reminded 14 and 7 days before. */
export const KIT_REMINDER_DAYS = [14, 7];

const MAX_TEXT = 1000;

export type KitStatus = "current" | "due-soon" | "overdue" | "action-required";

/**
 * Worked out, never chosen (framework 6): an unresolved issue first, then the
 * next inspection date. Due soon starts at the first reminder (as decision S2).
 */
export function deriveKitStatus(nextInspection: string, openIssue: boolean, today: string): KitStatus {
  if (openIssue) return "action-required";
  const daysLeft = daysBetween(today, nextInspection);
  if (daysLeft < 0) return "overdue";
  if (daysLeft <= Math.max(...KIT_REMINDER_DAYS)) return "due-soon";
  return "current";
}

async function latestInspection(ctx: QueryCtx, kitId: Id<"first_aid_kits">) {
  return await ctx.db
    .query("kit_inspections")
    .withIndex("by_kit", (q) => q.eq("kit_id", kitId))
    .order("desc")
    .first();
}

function issuesOf(inspection: Doc<"kit_inspections"> | null) {
  return inspection === null ? [] : inspection.answers.filter((entry) => entry.answer === "action").map((entry) => entry.check);
}

async function summarise(ctx: QueryCtx, kit: Doc<"first_aid_kits">, today: string) {
  const latest = await latestInspection(ctx, kit._id);
  const issues = issuesOf(latest);
  const openIssue = latest !== null && issues.length > 0 && latest.resolved_at === undefined;
  const status = deriveKitStatus(kit.next_inspection, openIssue, today);

  return {
    id: kit._id,
    code: kit.code,
    kit_type: kit.kit_type,
    location: kit.location,
    frequency_months: kit.frequency_months,
    last_inspection: kit.last_inspection,
    next_inspection: kit.next_inspection,
    status,
    needs_attention: status !== "current",
    open_issue:
      openIssue && latest !== null
        ? {
            inspection_id: latest._id,
            date: latest.date,
            checks: issues,
            corrective_action: latest.corrective_action,
          }
        : null,
  };
}

/** The kits assigned to the signed-in person (framework 10: "complete assigned first-aid inspections"). */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCaller(ctx);
    const today = businessToday();
    const kits = (
      await ctx.db
        .query("first_aid_kits")
        .withIndex("by_responsible", (q) => q.eq("responsible_user_id", user._id))
        .collect()
    ).filter((kit) => !kit.archived);
    const items = await Promise.all(kits.map((kit) => summarise(ctx, kit, today)));
    return items.sort((a, b) => a.next_inspection.localeCompare(b.next_inspection));
  },
});

async function assignedKit(ctx: QueryCtx, user: Doc<"users">, kitId: Id<"first_aid_kits">) {
  const kit = await ctx.db.get(kitId);
  if (kit === null || kit.archived) {
    throw new ConvexError("That first-aid kit no longer exists.");
  }
  if (kit.responsible_user_id !== user._id && !isAdminUser(user)) {
    throw new ConvexError("This kit isn't assigned to you.");
  }
  return kit;
}

/** One kit with its latest inspection, for its detail screen. */
export const detail = query({
  args: { kit_id: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCaller(ctx);
    const kitId = ctx.db.normalizeId("first_aid_kits", args.kit_id);
    const kit = kitId === null ? null : await ctx.db.get(kitId);
    if (kit === null || kit.archived) return null;
    if (kit.responsible_user_id !== user._id && !isAdminUser(user)) return null;

    const summary = await summarise(ctx, kit, businessToday());
    const latest = await latestInspection(ctx, kit._id);
    const inspector = latest === null ? null : await ctx.db.get(latest.inspected_by);

    return {
      ...summary,
      notes: kit.notes,
      latest:
        latest === null
          ? null
          : {
              date: latest.date,
              inspected_by_name: inspector === null ? "Unknown" : (inspector.name ?? inspector.email),
              earliest_expiry: latest.earliest_expiry,
              items_replaced: latest.items_replaced,
              resolved_at: latest.resolved_at,
              resolution: latest.resolution,
            },
    };
  },
});

/** A one-off URL the app uploads the optional inspection photo to. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireCaller(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

function optionalText(value: string | undefined, label: string) {
  const trimmed = value?.trim() || undefined;
  if (trimmed !== undefined && trimmed.length > MAX_TEXT) {
    throw new ConvexError(`${label} can be up to ${MAX_TEXT} characters.`);
  }
  return trimmed;
}

/**
 * The installer's inspection, from one screen (framework 8). The next date is
 * worked out from today and the kit's frequency.
 */
export const submitInspection = mutation({
  args: {
    kit_id: v.id("first_aid_kits"),
    answers: v.array(v.object({ check: v.string(), answer: v.string() })),
    earliest_expiry: v.string(),
    items_replaced: v.optional(v.string()),
    corrective_action: v.optional(v.string()),
    photo: v.optional(v.id("_storage")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ next_inspection: string; issues: number }> => {
    const user = await requireCaller(ctx);
    const kit = await assignedKit(ctx, user, args.kit_id);

    const answers: Doc<"kit_inspections">["answers"] = [];
    for (const check of KIT_CHECK_IDS) {
      const given = args.answers.find((entry) => entry.check === check);
      if (given === undefined || !["pass", "action", "na"].includes(given.answer)) {
        throw new ConvexError("Answer all 8 checks: Pass, Action or N/A.");
      }
      answers.push({ check, answer: given.answer as "pass" | "action" | "na" });
    }
    const issues = answers.filter((entry) => entry.answer === "action").length;

    const earliestExpiry = args.earliest_expiry.trim();
    if (!isValidIsoDate(earliestExpiry)) {
      throw new ConvexError("Select the earliest expiry date of the stock in the kit.");
    }

    const correctiveAction = optionalText(args.corrective_action, "Corrective action");
    if (issues > 0 && correctiveAction === undefined) {
      throw new ConvexError("Describe the corrective action needed for the checks marked Action.");
    }

    if (args.photo !== undefined && (await ctx.db.system.get(args.photo)) === null) {
      throw new ConvexError("Your photo didn't finish uploading. Please try again.");
    }

    const today = businessToday();
    const next = addMonths(today, kit.frequency_months);

    const inspectionId = await ctx.db.insert("kit_inspections", {
      kit_id: kit._id,
      inspected_by: user._id,
      date: today,
      answers,
      items_replaced: optionalText(args.items_replaced, "Items replaced"),
      earliest_expiry: earliestExpiry,
      photo: args.photo,
      corrective_action: issues > 0 ? correctiveAction : undefined,
      notes: optionalText(args.notes, "Notes"),
    });
    await ctx.db.patch(kit._id, { last_inspection: today, next_inspection: next });
    await ctx.db.insert("kit_audit", {
      kit_id: kit._id,
      inspection_id: inspectionId,
      action: "inspected",
      actor_id: user._id,
      details:
        issues > 0
          ? `Inspected: ${issues} ${issues === 1 ? "check needs" : "checks need"} action. Next inspection ${next} (was ${kit.next_inspection}).`
          : `Inspected: all clear. Next inspection ${next} (was ${kit.next_inspection}).`,
    });

    return { next_inspection: next, issues };
  },
});

/** Marks the latest inspection's issue fixed (decision K3). The next inspection date doesn't change. */
export const resolveIssue = mutation({
  args: { kit_id: v.id("first_aid_kits"), resolution: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCaller(ctx);
    const kit = await assignedKit(ctx, user, args.kit_id);

    const resolution = args.resolution.trim();
    if (resolution === "") {
      throw new ConvexError("Describe what you did to fix it, e.g. the items you replaced.");
    }
    if (resolution.length > MAX_TEXT) {
      throw new ConvexError(`That description can be up to ${MAX_TEXT} characters.`);
    }

    const latest = await latestInspection(ctx, kit._id);
    if (latest === null || issuesOf(latest).length === 0 || latest.resolved_at !== undefined) {
      throw new ConvexError("This kit has no open issue to resolve.");
    }

    await ctx.db.patch(latest._id, { resolved_at: Date.now(), resolved_by: user._id, resolution });
    await ctx.db.insert("kit_audit", {
      kit_id: kit._id,
      inspection_id: latest._id,
      action: "resolved",
      actor_id: user._id,
      details: resolution,
    });
  },
});

/**
 * Adds a kit and assigns it, until the admin dashboard has a kits screen:
 *   npx convex run kits:addKit '{"code":"V-03","kit_type":"Vehicle kit","location":"Vehicle 1DXK442","responsible_email":"…","next_inspection":"2026-12-01"}'
 */
export const addKit = internalMutation({
  args: {
    code: v.string(),
    kit_type: v.string(),
    location: v.string(),
    responsible_email: v.optional(v.string()),
    next_inspection: v.string(),
    frequency_months: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!isValidIsoDate(args.next_inspection)) throw new ConvexError("The next inspection date isn't a valid date.");

    let responsible: Id<"users"> | undefined;
    if (args.responsible_email !== undefined) {
      const needle = args.responsible_email.trim().toLowerCase();
      const user = (await ctx.db.query("users").collect()).find((row) => row.email.trim().toLowerCase() === needle);
      if (user === undefined) throw new ConvexError(`No account with the email ${args.responsible_email}.`);
      responsible = user._id;
    }

    return await ctx.db.insert("first_aid_kits", {
      code: args.code.trim(),
      kit_type: args.kit_type.trim(),
      location: args.location.trim(),
      responsible_user_id: responsible,
      frequency_months: args.frequency_months ?? DEFAULT_FREQUENCY_MONTHS,
      next_inspection: args.next_inspection,
      archived: false,
    });
  },
});

/**
 * Changes who a kit is assigned to, until the admin dashboard has a kits screen:
 *   npx convex run kits:assignKit '{"kit_id":"…","responsible_email":"…"}'
 */
export const assignKit = internalMutation({
  args: { kit_id: v.id("first_aid_kits"), responsible_email: v.string() },
  handler: async (ctx, args) => {
    const kit = await ctx.db.get(args.kit_id);
    if (kit === null) throw new ConvexError("That first-aid kit no longer exists.");
    const needle = args.responsible_email.trim().toLowerCase();
    const user = (await ctx.db.query("users").collect()).find((row) => row.email.trim().toLowerCase() === needle);
    if (user === undefined) throw new ConvexError(`No account with the email ${args.responsible_email}.`);
    await ctx.db.patch(kit._id, { responsible_user_id: user._id });
  },
});

// ---------------------------------------------------------------------------
// Admin dashboard: kits (framework 4F)
// ---------------------------------------------------------------------------

async function requireKitAdmin(ctx: QueryCtx) {
  const user = await requireCaller(ctx);
  if (!isAdminUser(user)) throw new ConvexError("Only an administrator can manage first-aid kits.");
  return user;
}

async function personName(ctx: QueryCtx, id: Id<"users"> | undefined) {
  if (id === undefined) return undefined;
  const user = await ctx.db.get(id);
  return user === null ? "Unknown" : (user.name ?? user.email);
}

const KIT_AUDIT_TEXT: Record<string, string> = {
  inspected: "Inspection submitted",
  resolved: "Corrective action completed",
  reminder_sent: "Reminder sent",
  escalated: "Escalated to management",
  edited: "Details changed",
  archived: "Archived",
};

/** One kit for the admin: details, latest inspection, recent inspections and activity. */
export const adminDetail = query({
  args: { kit_id: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireCaller(ctx);
    if (!canViewCompliance(viewer)) throw new ConvexError("Only admins and management can open this.");
    const kitId = ctx.db.normalizeId("first_aid_kits", args.kit_id);
    const kit = kitId === null ? null : await ctx.db.get(kitId);
    // An archived kit still opens, read-only, so its history stays reachable (framework 11).
    if (kit === null) return null;

    const summary = await summarise(ctx, kit, businessToday());
    const responsible = kit.responsible_user_id === undefined ? null : await ctx.db.get(kit.responsible_user_id);
    const subcontractor = responsible?.subcontractor_id === undefined ? null : await ctx.db.get(responsible.subcontractor_id);
    const inspections = await ctx.db
      .query("kit_inspections")
      .withIndex("by_kit", (q) => q.eq("kit_id", kit._id))
      .order("desc")
      .take(10);
    const latest = inspections[0];
    const trail = (
      await ctx.db
        .query("kit_audit")
        .withIndex("by_kit_and_key", (q) => q.eq("kit_id", kit._id))
        .collect()
    )
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 20);

    return {
      ...summary,
      notes: kit.notes,
      responsible_id: kit.responsible_user_id,
      responsible: responsible === null ? undefined : (responsible.name ?? responsible.email),
      entity: subcontractor?.name ?? "Western USI",
      archived: kit.archived,
      can_manage: isAdminUser(viewer) && !kit.archived,
      latest:
        latest === undefined
          ? null
          : {
              date: latest.date,
              inspected_by: await personName(ctx, latest.inspected_by),
              answers: latest.answers,
              earliest_expiry: latest.earliest_expiry,
              items_replaced: latest.items_replaced,
              corrective_action: latest.corrective_action,
              notes: latest.notes,
              photo_url: latest.photo === undefined ? null : await ctx.storage.getUrl(latest.photo),
              resolved_at: latest.resolved_at,
              resolved_by: await personName(ctx, latest.resolved_by),
              resolution: latest.resolution,
            },
      history: await Promise.all(
        inspections.map(async (inspection) => ({
          date: inspection.date,
          by: await personName(ctx, inspection.inspected_by),
          issues: inspection.answers.filter((entry) => entry.answer === "action").length,
          resolved: inspection.resolved_at !== undefined,
        })),
      ),
      activity: await Promise.all(
        trail.map(async (row) => ({
          at: row._creationTime,
          text: KIT_AUDIT_TEXT[row.action] ?? row.action,
          by: await personName(ctx, row.actor_id),
          details: row.details,
        })),
      ),
    };
  },
});

function checkKitFields(args: { frequency_months?: number; next_inspection?: string }) {
  if (args.frequency_months !== undefined && !(Number.isInteger(args.frequency_months) && args.frequency_months >= 1 && args.frequency_months <= 24)) {
    throw new ConvexError("Select how often the kit is inspected (1 to 24 months).");
  }
  if (args.next_inspection !== undefined && !isValidIsoDate(args.next_inspection)) {
    throw new ConvexError("Select a valid next inspection date.");
  }
}

async function requireInspector(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (user === null) throw new ConvexError("That installer no longer exists.");
  if (user.role !== "installer" && user.role !== "subcontractor") {
    throw new ConvexError(`${user.name ?? user.email} doesn't use the installer app, so they can't inspect a kit.`);
  }
  return user;
}

/** The admin adds a kit and assigns it (Figma F6, framework 4F, decisions K2 and K4). */
export const adminCreate = mutation({
  args: {
    code: v.string(),
    kit_type: v.string(),
    location: v.string(),
    responsible_user_id: v.id("users"),
    frequency_months: v.number(),
    next_inspection: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireKitAdmin(ctx);
    const code = args.code.trim();
    if (code === "") throw new ConvexError("Enter the kit ID, e.g. V-12.");
    if (args.kit_type.trim() === "") throw new ConvexError("Select the kit type.");
    if (args.location.trim() === "") throw new ConvexError("Enter where the kit is kept, or its vehicle.");
    checkKitFields(args);
    await requireInspector(ctx, args.responsible_user_id);
    const existing = await ctx.db
      .query("first_aid_kits")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .collect();
    if (existing.some((kit) => kit.code.toLowerCase() === code.toLowerCase())) {
      throw new ConvexError(`Kit ${code} already exists.`);
    }
    return await ctx.db.insert("first_aid_kits", {
      code,
      kit_type: args.kit_type.trim(),
      location: args.location.trim(),
      responsible_user_id: args.responsible_user_id,
      frequency_months: args.frequency_months,
      next_inspection: args.next_inspection,
      notes: args.notes?.trim() || undefined,
      archived: false,
    });
  },
});

/** The admin assigns a kit's inspection to an installer and sets when it's due (Figma FA4). */
export const adminAssign = mutation({
  args: {
    kit_id: v.id("first_aid_kits"),
    responsible_user_id: v.id("users"),
    next_inspection: v.string(),
    frequency_months: v.number(),
  },
  handler: async (ctx, args) => {
    await requireKitAdmin(ctx);
    const kit = await ctx.db.get(args.kit_id);
    if (kit === null || kit.archived) throw new ConvexError("That first-aid kit no longer exists.");
    checkKitFields(args);
    const user = await requireInspector(ctx, args.responsible_user_id);
    await ctx.db.patch(kit._id, {
      responsible_user_id: user._id,
      next_inspection: args.next_inspection,
      frequency_months: args.frequency_months,
    });
  },
});

/**
 * The admin corrects a kit's details with a reason (framework 11, decision
 * AD32). Who inspects it is changed with Assign Inspection.
 */
export const adminEdit = mutation({
  args: {
    kit_id: v.id("first_aid_kits"),
    code: v.string(),
    kit_type: v.string(),
    location: v.string(),
    frequency_months: v.number(),
    next_inspection: v.string(),
    notes: v.optional(v.string()),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireKitAdmin(ctx);
    const kit = await ctx.db.get(args.kit_id);
    if (kit === null || kit.archived) throw new ConvexError("That kit no longer exists.");
    const reason = checkReason(args.reason);
    const code = args.code.trim();
    if (code === "") throw new ConvexError("Enter the kit ID, e.g. V-12.");
    if (args.kit_type.trim() === "") throw new ConvexError("Select the kit type.");
    if (args.location.trim() === "") throw new ConvexError("Enter where the kit is kept, or its vehicle.");
    checkKitFields(args);
    if (code.toLowerCase() !== kit.code.toLowerCase()) {
      const others = await ctx.db
        .query("first_aid_kits")
        .withIndex("by_archived", (q) => q.eq("archived", false))
        .collect();
      if (others.some((other) => other._id !== kit._id && other.code.toLowerCase() === code.toLowerCase())) {
        throw new ConvexError(`Kit ${code} already exists.`);
      }
    }
    const next = {
      code,
      kit_type: args.kit_type.trim(),
      location: args.location.trim(),
      frequency_months: args.frequency_months,
      next_inspection: args.next_inspection,
      notes: args.notes?.trim() || undefined,
    };
    const details = describeEdit(
      [
        { label: "Kit ID", before: kit.code, after: next.code },
        { label: "Kit type", before: kit.kit_type, after: next.kit_type },
        { label: "Location", before: kit.location, after: next.location },
        { label: "Inspection every (months)", before: kit.frequency_months, after: next.frequency_months },
        { label: "Next inspection", before: kit.next_inspection, after: next.next_inspection, kind: "date" },
        { label: "Notes", before: kit.notes, after: next.notes, kind: "long" },
      ],
      reason,
    );
    await ctx.db.patch(kit._id, next);
    await ctx.db.insert("kit_audit", { kit_id: kit._id, action: "edited", actor_id: admin._id, details });
  },
});

/** The admin archives a kit that is no longer used, with a reason. It is kept, never deleted (framework 11). */
export const adminArchive = mutation({
  args: { kit_id: v.id("first_aid_kits"), reason: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireKitAdmin(ctx);
    const kit = await ctx.db.get(args.kit_id);
    if (kit === null || kit.archived) throw new ConvexError("That kit is already archived.");
    const reason = checkReason(args.reason, "archive");
    await ctx.db.patch(kit._id, { archived: true });
    await ctx.db.insert("kit_audit", { kit_id: kit._id, action: "archived", actor_id: admin._id, details: reason });
  },
});
