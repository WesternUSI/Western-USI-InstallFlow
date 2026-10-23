import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { isValidIsoDate, requireCaller } from "./accreditations";
import { canViewCompliance, isAdminUser } from "./permissions";
import { businessToday, formatLongDate } from "./whsDates";
import { checkReason, describeEdit } from "./whsEdits";

/**
 * Height and safety equipment (decision AD49): the company's ladders and
 * safety steps, imported from Mitch's sheet or added by hand. The admin
 * assigns a one-off check of an item to a worker with a "check by" date; the
 * worker does it on their phone. A check that finds a problem or damage
 * updates the item's Damage and stays Action required until the admin
 * reviews it (repaired, out of service or no action needed). Not in the
 * Compliance Register and not shown to installers except their own checks.
 */

const MAX_TEXT = 1000;
const MAX_SHORT_TEXT = 200;
const IMPORT_REASON = "Updated from Excel import";

/** The ladder checklist. Rope and pulley only for extension ladders, platform and guard rail only for platform ladders. */
const CHECKS: { id: string; label: string; applies?: (type: string) => boolean }[] = [
  { id: "feet", label: "Feet and non-slip pads" },
  { id: "rungs", label: "Rungs or steps" },
  { id: "rails", label: "Rails / stiles (no bends, cracks or dents)" },
  { id: "locks", label: "Locks, hinges and spreaders" },
  { id: "rope", label: "Rope and pulley", applies: (type) => type.toLowerCase().includes("extension") },
  { id: "platform", label: "Platform and guard rail", applies: (type) => type.toLowerCase().includes("platform") },
  { id: "labels", label: "Labels and load rating readable" },
];

export function checksFor(type: string) {
  return CHECKS.filter((check) => check.applies === undefined || check.applies(type)).map(({ id, label }) => ({ id, label }));
}

const CHECK_LABEL = new Map(CHECKS.map((check) => [check.id, check.label]));

export type EquipmentStatus = "current" | "overdue" | "action-required" | "out-of-service";

/** The same item: type, brand and name/number, ignoring case and spacing (AD49). */
function itemKey(item: { type: string; brand: string; name: string }) {
  return [item.type, item.brand, item.name].map((part) => part.replace(/\s+/g, " ").trim().toLowerCase()).join("|");
}

function text(value: string | undefined, label: string, max = MAX_SHORT_TEXT) {
  const trimmed = value?.replace(/\s+/g, " ").trim() || undefined;
  if (trimmed !== undefined && trimmed.length > max) throw new ConvexError(`${label} can be up to ${max} characters.`);
  return trimmed;
}

function hasIssue(check: Doc<"equipment_checks">) {
  return check.state === "done" && ((check.answers ?? []).some((entry) => entry.answer === "action") || check.damage_found === true);
}

async function checksOf(ctx: QueryCtx, equipmentId: Id<"equipment">) {
  return (
    await ctx.db
      .query("equipment_checks")
      .withIndex("by_equipment", (q) => q.eq("equipment_id", equipmentId))
      .collect()
  ).sort((a, b) => b._creationTime - a._creationTime);
}

function summarise(item: Doc<"equipment">, checks: Doc<"equipment_checks">[], today: string) {
  const open = checks.find((check) => check.state === "assigned");
  const latest = checks.find((check) => check.state === "done");
  const unreviewed = latest !== undefined && hasIssue(latest) && latest.reviewed_at === undefined;
  let status: EquipmentStatus = "current";
  if (item.out_of_service_date) status = "out-of-service";
  else if (unreviewed) status = "action-required";
  else if (open !== undefined && open.due < today) status = "overdue";
  return { open, latest, unreviewed, status };
}

async function personName(ctx: QueryCtx, id: Id<"users"> | undefined) {
  if (id === undefined) return undefined;
  const user = await ctx.db.get(id);
  return user === null ? "Unknown" : (user.name ?? user.email);
}

async function requireEquipmentAdmin(ctx: QueryCtx) {
  const user = await requireCaller(ctx);
  if (!isAdminUser(user)) throw new ConvexError("Only an administrator can manage equipment.");
  return user;
}

async function requireViewer(ctx: QueryCtx) {
  const user = await requireCaller(ctx);
  if (!canViewCompliance(user)) throw new ConvexError("Only admins and management can open this.");
  return user;
}

// ---------------------------------------------------------------------------
// Admin dashboard
// ---------------------------------------------------------------------------

/** Every item in use, with its status and open check. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireViewer(ctx);
    const today = businessToday();
    const items = await ctx.db
      .query("equipment")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .collect();
    const rows = await Promise.all(
      items.map(async (item) => {
        const { open, status } = summarise(item, await checksOf(ctx, item._id), today);
        return {
          id: item._id,
          type: item.type,
          brand: item.brand,
          name: item.name,
          damage: item.damage,
          status,
          check: open === undefined ? null : { assigned_to: await personName(ctx, open.assigned_to), due: open.due },
        };
      }),
    );
    return rows.sort((a, b) => a.type.localeCompare(b.type) || a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));
  },
});

const AUDIT_TEXT: Record<Doc<"equipment_audit">["action"], string> = {
  added: "Added",
  imported: "Updated from Excel import",
  assigned: "Check assigned",
  checked: "Check done",
  reviewed: "Reviewed",
  edited: "Details changed",
  archived: "Archived",
};

/** One item for the admin: details, open check, latest result, past checks and activity. */
export const adminDetail = query({
  args: { equipment_id: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const id = ctx.db.normalizeId("equipment", args.equipment_id);
    const item = id === null ? null : await ctx.db.get(id);
    // An archived item still opens, read-only, so its history stays reachable (framework 11).
    if (item === null) return null;
    const checks = await checksOf(ctx, item._id);
    const { open, latest, unreviewed, status } = summarise(item, checks, businessToday());
    const trail = (
      await ctx.db
        .query("equipment_audit")
        .withIndex("by_equipment", (q) => q.eq("equipment_id", item._id))
        .collect()
    )
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 30);

    return {
      id: item._id,
      type: item.type,
      brand: item.brand,
      name: item.name,
      damage: item.damage,
      repair_history: item.repair_history,
      out_of_service_date: item.out_of_service_date,
      last_updated: item.last_updated,
      status,
      archived: item.archived,
      can_manage: isAdminUser(viewer) && !item.archived,
      open_check:
        open === undefined
          ? null
          : { assigned_to_id: open.assigned_to, assigned_to: await personName(ctx, open.assigned_to), due: open.due },
      latest:
        latest === undefined
          ? null
          : {
              done_on: latest.done_on,
              by: await personName(ctx, latest.assigned_to),
              answers: (latest.answers ?? []).map((entry) => ({ label: CHECK_LABEL.get(entry.check) ?? entry.check, answer: entry.answer })),
              problem: latest.problem,
              damage_found: latest.damage_found,
              damage_description: latest.damage_description,
              notes: latest.notes,
              photo_url: latest.photo === undefined ? null : await ctx.storage.getUrl(latest.photo),
              needs_review: unreviewed,
              reviewed_at: latest.reviewed_at,
              reviewed_by: await personName(ctx, latest.reviewed_by),
              outcome: latest.outcome,
              review_note: latest.review_note,
            },
      history: await Promise.all(
        checks
          .filter((check) => check.state === "done")
          .map(async (check) => ({ id: check._id, done_on: check.done_on, by: await personName(ctx, check.assigned_to), issue: hasIssue(check) })),
      ),
      activity: await Promise.all(
        trail.map(async (row) => ({
          at: row._creationTime,
          text: AUDIT_TEXT[row.action],
          by: await personName(ctx, row.actor_id),
          details: row.details,
        })),
      ),
    };
  },
});

const rowValidator = v.object({
  type: v.string(),
  brand: v.string(),
  name: v.string(),
  damage: v.optional(v.string()),
  repair_history: v.optional(v.string()),
  out_of_service_date: v.optional(v.string()),
  last_updated: v.optional(v.string()),
});

/**
 * The admin's "Confirm Import": a new item is added; an item already there
 * (same type, brand and name/number) takes the sheet's Damage, Repair history,
 * Out of service date and Last Updated where the sheet has a value, each
 * change kept in its activity. A blank cell leaves the item as it is.
 * Archived items are left alone. Called in batches.
 */
export const importRows = mutation({
  args: { rows: v.array(rowValidator) },
  handler: async (ctx, args): Promise<{ added: number; updated: number; unchanged: number }> => {
    const admin = await requireEquipmentAdmin(ctx);
    const known = new Map((await ctx.db.query("equipment").collect()).map((item) => [itemKey(item), item]));
    let added = 0;
    let updated = 0;
    let unchanged = 0;
    for (const raw of args.rows) {
      const row = {
        type: text(raw.type, "The type"),
        brand: text(raw.brand, "The brand"),
        name: text(raw.name, "The name / number"),
        damage: text(raw.damage, "Damage", MAX_TEXT),
        repair_history: text(raw.repair_history, "Repair history", MAX_TEXT),
        out_of_service_date: text(raw.out_of_service_date, "Out of service date"),
        last_updated: text(raw.last_updated, "Last updated"),
      };
      if (!row.type || !row.name) throw new ConvexError("Every row needs a type and a name / number.");
      const item = { ...row, type: row.type, brand: row.brand ?? "", name: row.name };
      const existing = known.get(itemKey(item));
      if (existing === undefined) {
        const id = await ctx.db.insert("equipment", { ...item, archived: false });
        await ctx.db.insert("equipment_audit", { equipment_id: id, action: "added", actor_id: admin._id, details: "Imported from Excel." });
        known.set(itemKey(item), { ...item, archived: false, _id: id, _creationTime: Date.now() });
        added++;
        continue;
      }
      if (existing.archived) {
        unchanged++;
        continue;
      }
      const next = {
        damage: row.damage ?? existing.damage,
        repair_history: row.repair_history ?? existing.repair_history,
        out_of_service_date: row.out_of_service_date ?? existing.out_of_service_date,
        last_updated: row.last_updated ?? existing.last_updated,
      };
      const changes = [
        { label: "Damage", before: existing.damage, after: next.damage },
        { label: "Repair history", before: existing.repair_history, after: next.repair_history },
        { label: "Out of service date", before: existing.out_of_service_date, after: next.out_of_service_date, kind: "date" as const },
        { label: "Last updated", before: existing.last_updated, after: next.last_updated, kind: "date" as const },
      ];
      if (changes.every((change) => (change.before ?? "") === (change.after ?? ""))) {
        unchanged++;
        continue;
      }
      await ctx.db.patch(existing._id, next);
      await ctx.db.insert("equipment_audit", {
        equipment_id: existing._id,
        action: "imported",
        actor_id: admin._id,
        details: describeEdit(changes, IMPORT_REASON),
      });
      known.set(itemKey(item), { ...existing, ...next });
      updated++;
    }
    return { added, updated, unchanged };
  },
});

const fieldsValidator = {
  type: v.string(),
  brand: v.string(),
  name: v.string(),
  damage: v.optional(v.string()),
  repair_history: v.optional(v.string()),
  out_of_service_date: v.optional(v.string()),
};

function checkFields(args: { type: string; brand: string; name: string; damage?: string; repair_history?: string; out_of_service_date?: string }) {
  const type = text(args.type, "The type");
  const name = text(args.name, "The name / number");
  if (!type) throw new ConvexError("Enter the type, e.g. Extension Ladder.");
  if (!name) throw new ConvexError("Enter the name or number, e.g. Step 4.");
  const outOfService = text(args.out_of_service_date, "Out of service date");
  if (outOfService !== undefined && !isValidIsoDate(outOfService)) throw new ConvexError("Select a valid out of service date.");
  return {
    type,
    brand: text(args.brand, "The brand") ?? "",
    name,
    damage: text(args.damage, "Damage", MAX_TEXT),
    repair_history: text(args.repair_history, "Repair history", MAX_TEXT),
    out_of_service_date: outOfService,
  };
}

async function refuseDuplicate(ctx: QueryCtx, fields: { type: string; brand: string; name: string }, self?: Id<"equipment">) {
  const items = await ctx.db
    .query("equipment")
    .withIndex("by_archived", (q) => q.eq("archived", false))
    .collect();
  if (items.some((item) => item._id !== self && itemKey(item) === itemKey(fields))) {
    throw new ConvexError(`${fields.brand} ${fields.type} "${fields.name}" is already in the list.`.trim());
  }
}

/** The admin adds an item by hand. */
export const adminCreate = mutation({
  args: fieldsValidator,
  handler: async (ctx, args) => {
    const admin = await requireEquipmentAdmin(ctx);
    const fields = checkFields(args);
    await refuseDuplicate(ctx, fields);
    const id = await ctx.db.insert("equipment", { ...fields, archived: false });
    await ctx.db.insert("equipment_audit", { equipment_id: id, action: "added", actor_id: admin._id });
    return id;
  },
});

/** The admin corrects an item's details with a reason (framework 11, decision AD32). */
export const adminEdit = mutation({
  args: { equipment_id: v.id("equipment"), ...fieldsValidator, reason: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireEquipmentAdmin(ctx);
    const item = await ctx.db.get(args.equipment_id);
    if (item === null || item.archived) throw new ConvexError("That item no longer exists.");
    const reason = checkReason(args.reason);
    const next = checkFields(args);
    await refuseDuplicate(ctx, next, item._id);
    const details = describeEdit(
      [
        { label: "Type", before: item.type, after: next.type },
        { label: "Brand", before: item.brand, after: next.brand },
        { label: "Name / number", before: item.name, after: next.name },
        { label: "Damage", before: item.damage, after: next.damage },
        { label: "Repair history", before: item.repair_history, after: next.repair_history },
        { label: "Out of service date", before: item.out_of_service_date, after: next.out_of_service_date, kind: "date" },
      ],
      reason,
    );
    await ctx.db.patch(item._id, next);
    await ctx.db.insert("equipment_audit", { equipment_id: item._id, action: "edited", actor_id: admin._id, details });
  },
});

/** The admin archives an item no longer used, with a reason; an open check is cancelled. Kept, never deleted (framework 11). */
export const adminArchive = mutation({
  args: { equipment_id: v.id("equipment"), reason: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireEquipmentAdmin(ctx);
    const item = await ctx.db.get(args.equipment_id);
    if (item === null || item.archived) throw new ConvexError("That item is already archived.");
    const reason = checkReason(args.reason, "archive");
    for (const check of await checksOf(ctx, item._id)) {
      if (check.state === "assigned") await ctx.db.patch(check._id, { state: "cancelled" });
    }
    await ctx.db.patch(item._id, { archived: true });
    await ctx.db.insert("equipment_audit", { equipment_id: item._id, action: "archived", actor_id: admin._id, details: reason });
  },
});

/**
 * The admin assigns a check of an item to a worker, to do by a date. An item
 * has one open check at a time: assigning again changes who and when.
 */
export const adminAssign = mutation({
  args: { equipment_id: v.id("equipment"), user_id: v.id("users"), due: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireEquipmentAdmin(ctx);
    const item = await ctx.db.get(args.equipment_id);
    if (item === null || item.archived) throw new ConvexError("That item no longer exists.");
    if (!isValidIsoDate(args.due)) throw new ConvexError("Select the date the check is due by.");
    const worker = await ctx.db.get(args.user_id);
    if (worker === null) throw new ConvexError("That worker no longer exists.");
    if (worker.role !== "installer" && worker.role !== "subcontractor") {
      throw new ConvexError(`${worker.name ?? worker.email} doesn't use the installer app, so they can't do a check.`);
    }
    const name = worker.name ?? worker.email;
    const open = (await checksOf(ctx, item._id)).find((check) => check.state === "assigned");
    if (open !== undefined) {
      if (open.assigned_to === worker._id && open.due === args.due) throw new ConvexError("Nothing was changed.");
      const before = (await personName(ctx, open.assigned_to)) ?? "Unknown";
      await ctx.db.patch(open._id, { assigned_to: worker._id, due: args.due, assigned_by: admin._id });
      await ctx.db.insert("equipment_audit", {
        equipment_id: item._id,
        check_id: open._id,
        action: "assigned",
        actor_id: admin._id,
        details: `Changed from ${before}, due ${formatLongDate(open.due)}, to ${name}, due ${formatLongDate(args.due)}.`,
      });
      return;
    }
    const checkId = await ctx.db.insert("equipment_checks", {
      equipment_id: item._id,
      assigned_to: worker._id,
      assigned_by: admin._id,
      due: args.due,
      state: "assigned",
    });
    await ctx.db.insert("equipment_audit", {
      equipment_id: item._id,
      check_id: checkId,
      action: "assigned",
      actor_id: admin._id,
      details: `${name}, due ${formatLongDate(args.due)}.`,
    });
  },
});

/**
 * The admin reviews a check that found a problem or damage: repaired (added
 * to the repair history, Damage back to "Nil"), out of service from today, or
 * no action needed. The note is required either way.
 */
export const adminReview = mutation({
  args: {
    equipment_id: v.id("equipment"),
    outcome: v.union(v.literal("repaired"), v.literal("out-of-service"), v.literal("no-action")),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireEquipmentAdmin(ctx);
    const item = await ctx.db.get(args.equipment_id);
    if (item === null || item.archived) throw new ConvexError("That item no longer exists.");
    const note = text(args.note, "The note", MAX_TEXT);
    if (note === undefined) throw new ConvexError(args.outcome === "repaired" ? "Describe the repair." : "Add a note about your decision.");
    const latest = (await checksOf(ctx, item._id)).find((check) => check.state === "done");
    if (latest === undefined || !hasIssue(latest) || latest.reviewed_at !== undefined) {
      throw new ConvexError("This item has no check waiting for review.");
    }
    const today = businessToday();
    await ctx.db.patch(latest._id, { reviewed_at: Date.now(), reviewed_by: admin._id, outcome: args.outcome, review_note: note });
    if (args.outcome === "repaired") {
      const entry = `${note} ${formatLongDate(today)}`;
      await ctx.db.patch(item._id, { damage: "Nil", repair_history: item.repair_history ? `${item.repair_history}; ${entry}` : entry });
    } else if (args.outcome === "out-of-service") {
      await ctx.db.patch(item._id, { out_of_service_date: today });
    }
    const outcome = { repaired: "Repaired", "out-of-service": "Out of service", "no-action": "No action needed" }[args.outcome];
    await ctx.db.insert("equipment_audit", {
      equipment_id: item._id,
      check_id: latest._id,
      action: "reviewed",
      actor_id: admin._id,
      details: `${outcome}: ${note}`,
    });
  },
});

// ---------------------------------------------------------------------------
// Installer app
// ---------------------------------------------------------------------------

/** The checks assigned to the signed-in worker and not yet done, soonest first. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCaller(ctx);
    const today = businessToday();
    const checks = await ctx.db
      .query("equipment_checks")
      .withIndex("by_assigned_and_state", (q) => q.eq("assigned_to", user._id).eq("state", "assigned"))
      .collect();
    const items = await Promise.all(
      checks.map(async (check) => {
        const item = await ctx.db.get(check.equipment_id);
        if (item === null || item.archived) return null;
        return {
          id: check._id,
          title: item.name,
          subtitle: [item.brand, item.type].filter(Boolean).join(" · "),
          due: check.due,
          status: check.due < today ? ("overdue" as const) : ("current" as const),
        };
      }),
    );
    return items.filter((item) => item !== null).sort((a, b) => a.due.localeCompare(b.due));
  },
});

async function assignedCheck(ctx: QueryCtx, user: Doc<"users">, checkId: Id<"equipment_checks">) {
  const check = await ctx.db.get(checkId);
  if (check === null || check.state !== "assigned") throw new ConvexError("This check has already been done or was cancelled.");
  if (check.assigned_to !== user._id) throw new ConvexError("This check isn't assigned to you.");
  const item = await ctx.db.get(check.equipment_id);
  if (item === null || item.archived) throw new ConvexError("That item no longer exists.");
  return { check, item };
}

/** One open check for its screen: the item and the checklist lines for its type. */
export const checkDetail = query({
  args: { check_id: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCaller(ctx);
    const id = ctx.db.normalizeId("equipment_checks", args.check_id);
    const check = id === null ? null : await ctx.db.get(id);
    if (check === null || check.state !== "assigned" || check.assigned_to !== user._id) return null;
    const item = await ctx.db.get(check.equipment_id);
    if (item === null || item.archived) return null;
    return {
      id: check._id,
      title: item.name,
      subtitle: [item.brand, item.type].filter(Boolean).join(" · "),
      due: check.due,
      damage: item.damage,
      checks: checksFor(item.type),
    };
  },
});

/** A one-off URL the app uploads the optional damage photo to. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireCaller(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** The worker's check, from one screen. Damage found updates the item's Damage. */
export const submitCheck = mutation({
  args: {
    check_id: v.id("equipment_checks"),
    answers: v.array(v.object({ check: v.string(), answer: v.string() })),
    problem: v.optional(v.string()),
    damage_found: v.boolean(),
    damage_description: v.optional(v.string()),
    photo: v.optional(v.id("_storage")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ issue: boolean }> => {
    const user = await requireCaller(ctx);
    const { check, item } = await assignedCheck(ctx, user, args.check_id);
    const lines = checksFor(item.type);
    const answers: { check: string; answer: "pass" | "action" }[] = [];
    for (const line of lines) {
      const given = args.answers.find((entry) => entry.check === line.id);
      if (given === undefined || (given.answer !== "pass" && given.answer !== "action")) {
        throw new ConvexError(`Answer all ${lines.length} checks: Pass or Action.`);
      }
      answers.push({ check: line.id, answer: given.answer });
    }
    const actions = answers.filter((entry) => entry.answer === "action").length;
    const problem = text(args.problem, "The problem", MAX_TEXT);
    if (actions > 0 && problem === undefined) throw new ConvexError("Describe what's wrong with the checks marked Action.");
    const damage = text(args.damage_description, "The damage", MAX_TEXT);
    if (args.damage_found && damage === undefined) throw new ConvexError("Describe the damage.");
    if (args.photo !== undefined && (await ctx.db.system.get(args.photo)) === null) {
      throw new ConvexError("Your photo didn't finish uploading. Please try again.");
    }

    await ctx.db.patch(check._id, {
      state: "done",
      done_on: businessToday(),
      answers,
      problem: actions > 0 ? problem : undefined,
      damage_found: args.damage_found,
      damage_description: args.damage_found ? damage : undefined,
      photo: args.photo,
      notes: text(args.notes, "Notes", MAX_TEXT),
    });
    if (args.damage_found && damage !== undefined) await ctx.db.patch(item._id, { damage });
    const issue = actions > 0 || args.damage_found;
    await ctx.db.insert("equipment_audit", {
      equipment_id: item._id,
      check_id: check._id,
      action: "checked",
      actor_id: user._id,
      details: issue
        ? [actions > 0 ? `${actions} ${actions === 1 ? "check needs" : "checks need"} action: ${problem}` : "", args.damage_found ? `Damage: ${damage}` : ""]
            .filter(Boolean)
            .join(". ")
        : "All clear, no damage.",
    });
    return { issue };
  },
});
