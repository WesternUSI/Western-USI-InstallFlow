import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { isValidIsoDate, requireCaller } from "./accreditations";
import { enabledRecipientEmails } from "./emails";
import { canViewCompliance, isAdminUser, isManagementUser } from "./permissions";
import { addDays, addMonths, businessToday, formatLongDate } from "./whsDates";
import { managementLink } from "./whsLinks";
import { escalateAfterDays } from "./whsSettings";
import { daysBetween, planReminders } from "./whsStatus";
import { checkReason, describeEdit } from "./whsEdits";

/**
 * Height and safety equipment (decision AD49): the company's ladders and
 * safety steps, imported from Mitch's sheet or added by hand. The admin
 * assigns a one-off check of an item to a worker with a "check by" date; the
 * worker answers "Any damage?" and adds a recommendation on their phone
 * (Mitch, 23 Oct). Damage found updates the item's Damage and stays Action
 * required until the admin reviews it (repaired, out of service or no action
 * needed). Checks repeat (decision AD57): each item is checked every few
 * months (3 by default), and when a check is done the next one is set for the
 * same worker. Items are in the Compliance Register and on the dashboards, with
 * reminders like first-aid kits. Installers see only their own checks.
 */

const MAX_TEXT = 1000;
const MAX_SHORT_TEXT = 200;
const IMPORT_REASON = "Updated from Excel import";

export type EquipmentStatus = "current" | "due-soon" | "overdue" | "action-required" | "out-of-service";

/** Months between checks when none is set (decision AD57). */
export const DEFAULT_CHECK_MONTHS = 3;
/** Reminders before a check is due, as for first-aid kits (decision K6); also when it becomes Due soon. */
export const EQUIPMENT_REMINDER_DAYS = [14, 7];

export const checkMonths = (item: Pick<Doc<"equipment">, "frequency_months">) => item.frequency_months ?? DEFAULT_CHECK_MONTHS;
/** One worker's months between checks: their own, else the item's, else 3 (decision AD57). */
export const workerMonths = (check: Pick<Doc<"equipment_checks">, "frequency_months">, item: Pick<Doc<"equipment">, "frequency_months">) =>
  check.frequency_months ?? checkMonths(item);
const monthsText = (months: number) => `every ${months} ${months === 1 ? "month" : "months"}`;

function checkFrequency(months: number) {
  if (!(Number.isInteger(months) && months >= 1 && months <= 24)) throw new ConvexError("Select how often it's checked (1 to 24 months).");
}

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
  return check.state === "done" && check.damage_found === true;
}

export async function checksOf(ctx: QueryCtx, equipmentId: Id<"equipment">) {
  return (
    await ctx.db
      .query("equipment_checks")
      .withIndex("by_equipment", (q) => q.eq("equipment_id", equipmentId))
      .collect()
  ).sort((a, b) => b._creationTime - a._creationTime);
}

/**
 * An item's checks summed up. Several workers can each have their own open
 * check (decision AD57): `opens` soonest first, `open` the soonest. The item
 * shows the most urgent of them, and Action required while any check that
 * found damage is waiting for review.
 */
export function summarise(item: Doc<"equipment">, checks: Doc<"equipment_checks">[], today: string) {
  const opens = checks.filter((check) => check.state === "assigned").sort((a, b) => a.due.localeCompare(b.due));
  const open = opens[0];
  const latest = checks.find((check) => check.state === "done");
  const unreviewed = checks.some((check) => hasIssue(check) && check.reviewed_at === undefined);
  let status: EquipmentStatus = "current";
  if (item.out_of_service_date) status = "out-of-service";
  else if (unreviewed) status = "action-required";
  else if (open !== undefined && open.due < today) status = "overdue";
  else if (open !== undefined && daysBetween(today, open.due) <= Math.max(...EQUIPMENT_REMINDER_DAYS)) status = "due-soon";
  return { opens, open, latest, unreviewed, status };
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
        const { opens, open, status } = summarise(item, await checksOf(ctx, item._id), today);
        return {
          id: item._id,
          type: item.type,
          brand: item.brand,
          name: item.name,
          damage: item.damage,
          status,
          // Each worker with their own frequency, e.g. "Umar (every 12 months), Sam (every 3 months)".
          check:
            open === undefined
              ? null
              : {
                  assigned_to: (
                    await Promise.all(opens.map(async (check) => `${await personName(ctx, check.assigned_to)} (${monthsText(workerMonths(check, item))})`))
                  ).join(", "),
                  due: open.due,
                },
        };
      }),
    );
    return rows.sort((a, b) => a.type.localeCompare(b.type) || a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));
  },
});

export const AUDIT_TEXT: Record<Doc<"equipment_audit">["action"], string> = {
  added: "Added",
  imported: "Updated from Excel import",
  assigned: "Check assigned",
  checked: "Check done",
  reviewed: "Reviewed",
  edited: "Details changed",
  archived: "Archived",
  reminder_sent: "Reminder sent",
  escalated: "Escalated to management",
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
    const { opens, latest, unreviewed, status } = summarise(item, checks, businessToday());
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
      // Each worker's own next check, soonest first (decision AD57).
      open_checks: await Promise.all(
        opens.map(async (check) => ({
          id: check._id,
          assigned_to_id: check.assigned_to,
          assigned_to: (await personName(ctx, check.assigned_to)) ?? "Unknown",
          due: check.due,
          frequency_months: workerMonths(check, item),
        })),
      ),
      latest:
        latest === undefined
          ? null
          : {
              done_on: latest.done_on,
              by: await personName(ctx, latest.assigned_to),
              damage_found: latest.damage_found,
              damage_description: latest.damage_description,
              recommendation: latest.recommendation,
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
 * Schedules an item's checks for these workers (decision AD57): each gets
 * their own check with this due date and frequency. A worker who already
 * checks it has their date and frequency changed. Nobody else is touched:
 * a worker stops checking it only through adminStopCheck.
 */
async function schedule(
  ctx: MutationCtx,
  admin: Doc<"users">,
  item: Doc<"equipment">,
  workers: Doc<"users">[],
  due: string,
  months: number,
) {
  const opens = (await checksOf(ctx, item._id)).filter((check) => check.state === "assigned");
  let changed = false;
  for (const worker of workers) {
    const name = worker.name ?? worker.email;
    const existing = opens.find((check) => check.assigned_to === worker._id);
    if (existing !== undefined) {
      const before = workerMonths(existing, item);
      if (existing.due === due && before === months) continue;
      await ctx.db.patch(existing._id, { due, frequency_months: months, assigned_by: admin._id });
      await ctx.db.insert("equipment_audit", {
        equipment_id: item._id,
        check_id: existing._id,
        action: "assigned",
        actor_id: admin._id,
        details: `${name}: was due ${formatLongDate(existing.due)}, ${monthsText(before)}; now due ${formatLongDate(due)}, ${monthsText(months)}.`,
      });
    } else {
      const checkId = await ctx.db.insert("equipment_checks", {
        equipment_id: item._id,
        assigned_to: worker._id,
        assigned_by: admin._id,
        due,
        frequency_months: months,
        state: "assigned",
      });
      await ctx.db.insert("equipment_audit", {
        equipment_id: item._id,
        check_id: checkId,
        action: "assigned",
        actor_id: admin._id,
        details: `${name}, due ${formatLongDate(due)}, ${monthsText(months)}.`,
      });
    }
    changed = true;
  }
  return changed;
}

/** Checks the workers, date and frequency for scheduling. */
async function checkSchedule(ctx: QueryCtx, args: { user_ids: Id<"users">[]; due: string; frequency_months: number }) {
  if (args.user_ids.length === 0) throw new ConvexError("Tick at least one worker who does the checks.");
  if (!isValidIsoDate(args.due)) throw new ConvexError("Select the date the first check is due by.");
  checkFrequency(args.frequency_months);
  const workers: Doc<"users">[] = [];
  for (const id of new Set(args.user_ids)) {
    const worker = await ctx.db.get(id);
    if (worker === null) throw new ConvexError("One of the ticked workers no longer exists. Reload and try again.");
    if (worker.role !== "installer" && worker.role !== "subcontractor") {
      throw new ConvexError(`${worker.name ?? worker.email} doesn't use the installer app, so they can't do a check.`);
    }
    workers.push(worker);
  }
  return workers;
}

/** The admin schedules one item's checks. */
export const adminAssign = mutation({
  args: { equipment_id: v.id("equipment"), user_ids: v.array(v.id("users")), due: v.string(), frequency_months: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const admin = await requireEquipmentAdmin(ctx);
    const item = await ctx.db.get(args.equipment_id);
    if (item === null || item.archived) throw new ConvexError("That item no longer exists.");
    if (item.out_of_service_date) throw new ConvexError("This item is out of service. Clear its out of service date in Edit Details first.");
    const months = args.frequency_months ?? checkMonths(item);
    const workers = await checkSchedule(ctx, { ...args, frequency_months: months });
    if (!(await schedule(ctx, admin, item, workers, args.due, months))) throw new ConvexError("Nothing was changed.");
  },
});

/** The admin stops one worker checking an item: their open check is cancelled, kept in the history (decision AD57). */
export const adminStopCheck = mutation({
  args: { check_id: v.id("equipment_checks") },
  handler: async (ctx, args) => {
    const admin = await requireEquipmentAdmin(ctx);
    const check = await ctx.db.get(args.check_id);
    if (check === null || check.state !== "assigned") throw new ConvexError("That worker no longer has this check.");
    await ctx.db.patch(check._id, { state: "cancelled" });
    await ctx.db.insert("equipment_audit", {
      equipment_id: check.equipment_id,
      check_id: check._id,
      action: "assigned",
      actor_id: admin._id,
      details: `${(await personName(ctx, check.assigned_to)) ?? "Unknown"} no longer checks it.`,
    });
  },
});

/** The admin schedules many items' checks at once for the same workers, due date and frequency; other workers are left as they are (decision AD57). */
export const adminAssignMany = mutation({
  args: { equipment_ids: v.array(v.id("equipment")), user_ids: v.array(v.id("users")), due: v.string(), frequency_months: v.number() },
  handler: async (ctx, args): Promise<{ scheduled: number; skipped: number }> => {
    const admin = await requireEquipmentAdmin(ctx);
    if (args.equipment_ids.length === 0) throw new ConvexError("Tick at least one item to schedule.");
    const workers = await checkSchedule(ctx, args);
    let scheduled = 0;
    let skipped = 0;
    for (const id of new Set(args.equipment_ids)) {
      const item = await ctx.db.get(id);
      // Archived or out-of-service items are left alone.
      if (item === null || item.archived || item.out_of_service_date) {
        skipped++;
        continue;
      }
      if (await schedule(ctx, admin, item, workers, args.due, args.frequency_months)) scheduled++;
    }
    return { scheduled, skipped };
  },
});

/**
 * The admin reviews a check that found damage: repaired (added
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
    // With several workers, every check that found damage and is still waiting is reviewed together (decision AD57).
    const waiting = (await checksOf(ctx, item._id)).filter((check) => hasIssue(check) && check.reviewed_at === undefined);
    const latest = waiting[0];
    if (latest === undefined) throw new ConvexError("This item has no check waiting for review.");
    const today = businessToday();
    for (const check of waiting) {
      await ctx.db.patch(check._id, { reviewed_at: Date.now(), reviewed_by: admin._id, outcome: args.outcome, review_note: note });
    }
    if (args.outcome === "repaired") {
      const entry = `${note} ${formatLongDate(today)}`;
      await ctx.db.patch(item._id, { damage: "Nil", repair_history: item.repair_history ? `${item.repair_history}; ${entry}` : entry });
    } else if (args.outcome === "out-of-service") {
      await ctx.db.patch(item._id, { out_of_service_date: today });
      // An item out of service isn't checked until it is back in use (decision AD57).
      for (const check of await checksOf(ctx, item._id)) {
        if (check.state === "assigned") await ctx.db.patch(check._id, { state: "cancelled" });
      }
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

/** One open check for its screen. */
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

/** The worker's check: "Any damage?" and an optional recommendation (Mitch, 23 Oct). Damage found updates the item's Damage. */
export const submitCheck = mutation({
  args: {
    check_id: v.id("equipment_checks"),
    damage_found: v.boolean(),
    damage_description: v.optional(v.string()),
    recommendation: v.optional(v.string()),
    photo: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args): Promise<{ issue: boolean }> => {
    const user = await requireCaller(ctx);
    const { check, item } = await assignedCheck(ctx, user, args.check_id);
    const recommendation = text(args.recommendation, "The recommendation", MAX_TEXT);
    const damage = text(args.damage_description, "The damage", MAX_TEXT);
    if (args.damage_found && damage === undefined) throw new ConvexError("Describe the damage.");
    if (args.photo !== undefined && (await ctx.db.system.get(args.photo)) === null) {
      throw new ConvexError("Your photo didn't finish uploading. Please try again.");
    }

    await ctx.db.patch(check._id, {
      state: "done",
      done_on: businessToday(),
      damage_found: args.damage_found,
      damage_description: args.damage_found ? damage : undefined,
      recommendation,
      photo: args.damage_found ? args.photo : undefined,
    });
    if (args.damage_found && damage !== undefined) await ctx.db.patch(item._id, { damage });
    await ctx.db.insert("equipment_audit", {
      equipment_id: item._id,
      check_id: check._id,
      action: "checked",
      actor_id: user._id,
      details: [args.damage_found ? `Damage: ${damage}` : "No damage", recommendation ? `Recommendation: ${recommendation}` : ""].filter(Boolean).join(". "),
    });
    // The next check, for the same worker, a frequency later (decision AD57).
    if (!item.out_of_service_date) {
      const months = workerMonths(check, item);
      const due = addMonths(businessToday(), months);
      const nextId = await ctx.db.insert("equipment_checks", {
        equipment_id: item._id,
        assigned_to: check.assigned_to,
        assigned_by: check.assigned_by,
        due,
        frequency_months: months,
        state: "assigned",
      });
      await ctx.db.insert("equipment_audit", {
        equipment_id: item._id,
        check_id: nextId,
        action: "assigned",
        details: `Next check set automatically: ${user.name ?? user.email}, due ${formatLongDate(due)}.`,
      });
    }
    return { issue: args.damage_found };
  },
});

// ---------------------------------------------------------------------------
// Check reminders
// ---------------------------------------------------------------------------

/**
 * Height and safety equipment check reminders (decision AD57), the same as
 * first-aid kits (K6) and run by the same 8am check (`whsReminders.sweepAtEight`):
 * 14 and 7 days before, to the worker the check is assigned to; once overdue,
 * weekly to them and the admin list; escalated to management once after the
 * escalation setting (AD47). Keys include the due date, so each check starts afresh.
 */

const PAUSE_BETWEEN_EMAILS_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function days(count: number): string {
  return `${count} ${count === 1 ? "day" : "days"}`;
}

interface EquipmentReminder {
  equipment_id: Id<"equipment">;
  key: string;
  action: "reminder_sent" | "escalated";
  to: string[];
  subject: string;
  lines: string[];
  link?: { label: string; url: string };
}

/** Every equipment reminder due today and not yet sent. Read-only, so it doubles as a dry run. */
export const remindersDue = internalQuery({
  args: { today: v.string() },
  handler: async (ctx, args): Promise<EquipmentReminder[]> => {
    const escalationDays = await escalateAfterDays(ctx);
    const horizon = addDays(args.today, Math.max(...EQUIPMENT_REMINDER_DAYS));
    const adminEmails = await enabledRecipientEmails(ctx);
    const managementEmails = (await ctx.db.query("users").collect())
      .filter(isManagementUser)
      .map((user) => user.email);

    const reminders: EquipmentReminder[] = [];
    const items = await ctx.db
      .query("equipment")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .collect();
    for (const item of items) {
      if (item.out_of_service_date) continue;
      // Each worker's own check is reminded on its own (decision AD57).
      const opens = (
        await ctx.db
          .query("equipment_checks")
          .withIndex("by_equipment", (q) => q.eq("equipment_id", item._id))
          .collect()
      ).filter((check) => check.state === "assigned" && check.due <= horizon);
      for (const open of opens) {
        const planned = planReminders({
          today: args.today,
          expires: open.due,
          verifiedDate: businessToday(open._creationTime),
          reminderDays: EQUIPMENT_REMINDER_DAYS,
          escalateAfterDays: escalationDays,
        });
        if (planned.length === 0) continue;

        const worker = await ctx.db.get(open.assigned_to);
        const workerTo = worker === null ? adminEmails : [worker.email];
        const greeting = worker === null ? [] : [`Hi ${worker.name ?? worker.email},`];
        const dueDate = formatLongDate(open.due);
        const detail = [item.brand, item.type].filter(Boolean).join(" ");
        const name = detail ? `${item.name} (${detail})` : item.name;

        for (const candidate of planned) {
          const key = `${open.due}:${candidate.key}:${open.assigned_to}`;
          const sent = await ctx.db
            .query("equipment_audit")
            .withIndex("by_equipment_and_key", (q) => q.eq("equipment_id", item._id).eq("key", key))
            .first();
          if (sent !== null) continue;

          if (candidate.kind === "pre") {
            const left = candidate.daysLeft ?? 0;
            reminders.push({
              equipment_id: item._id,
              key,
              action: "reminder_sent",
              to: workerTo,
              subject: `Equipment check due ${dueDate}: ${item.name}`,
              lines: [
                ...greeting,
                left === 0 ? `${name} is due for its check today (${dueDate}).` : `${name} is due for its check on ${dueDate}, in ${days(left)}.`,
                "Open Safety in the Western USI InstallFlow app, then Equipment Checks, and complete the check.",
              ],
            });
          } else if (candidate.kind === "overdue") {
            reminders.push({
              equipment_id: item._id,
              key,
              action: "reminder_sent",
              to: [...new Set([...workerTo, ...adminEmails])],
              subject: `Equipment check overdue: ${item.name}`,
              lines: [
                `${name} was due for its check on ${dueDate}, ${days(candidate.overdueDays ?? 0)} ago${worker === null ? "" : ` (assigned to ${worker.name ?? worker.email})`}.`,
                "Please complete it in the Western USI InstallFlow app. This reminder goes out each week until it's done.",
              ],
            });
          } else {
            reminders.push({
              equipment_id: item._id,
              key,
              action: "escalated",
              to: managementEmails,
              subject: `Escalation: equipment check for ${item.name} is ${days(candidate.overdueDays ?? 0)} overdue`,
              link: managementLink(`/management/equipment/${item._id}`),
              lines: [
                `${name} was due for its check on ${dueDate} and is now ${days(candidate.overdueDays ?? 0)} overdue${worker === null ? "" : ` (assigned to ${worker.name ?? worker.email})`}.`,
                "Reminders have gone out each week. Please follow up.",
              ],
            });
          }
        }
      }
    }
    return reminders.filter((reminder) => reminder.to.length > 0);
  },
});

export const logReminderSent = internalMutation({
  args: {
    equipment_id: v.id("equipment"),
    key: v.string(),
    action: v.union(v.literal("reminder_sent"), v.literal("escalated")),
    details: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("equipment_audit", args);
  },
});

/** Sends every equipment reminder due today. Called by `whsReminders.sweepAtEight`. */
export const sweepReminders = internalAction({
  args: {},
  handler: async (ctx): Promise<{ due: number; sent: number; failed: number }> => {
    const reminders = await ctx.runQuery(internal.equipment.remindersDue, { today: businessToday() });

    let sent = 0;
    let failed = 0;
    for (const [index, reminder] of reminders.entries()) {
      if (index > 0) await sleep(PAUSE_BETWEEN_EMAILS_MS);
      try {
        const emailed: string[] = await ctx.runAction(internal.email.sendWhsEmail, {
          to: reminder.to,
          subject: reminder.subject,
          lines: reminder.lines,
          link: reminder.link,
        });
        await ctx.runMutation(internal.equipment.logReminderSent, {
          equipment_id: reminder.equipment_id,
          key: reminder.key,
          action: reminder.action,
          details: emailed.length > 0 ? `Emailed ${emailed.join(", ")}: ${reminder.subject}` : `Not emailed (recipients on the skip list): ${reminder.subject}`,
        });
        sent++;
      } catch (error) {
        failed++;
        console.error(`Equipment reminder ${reminder.key} for ${reminder.equipment_id} was not sent`, error);
      }
    }
    return { due: reminders.length, sent, failed };
  },
});
