import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { enabledRecipientEmails } from "./emails";
import { addDays, businessHour, businessToday, formatLongDate } from "./whsDates";
import { accreditationLink, managementLink } from "./whsLinks";
import { planReminders } from "./whsStatus";
import { isManagementUser } from "./permissions";
import { escalateAfterDays } from "./whsSettings";

/**
 * Accreditation reminders (WHS framework 7), by email. Decisions are in
 * docs/reference/whs-decisions.md.
 *
 * One daily check rather than a scheduled job per accreditation: a renewal, a
 * corrected expiry or a changed reminder schedule would otherwise leave stale
 * jobs behind. The check works out what is due from the data each time, and
 * logs each reminder it sends (`whs_audit`, with a key) so it never repeats one.
 */

/** The reminders go out at this hour, business time (8am). */
const SEND_HOUR = 8;

/** Pause between reminder emails, so a big morning stays under Resend's send rate. */
const PAUSE_BETWEEN_EMAILS_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


interface Reminder {
  record_id: Id<"whs_records">;
  version_id: Id<"whs_record_versions">;
  /** Per audience, e.g. "pre-60:worker", so each audience is logged and sent once. */
  key: string;
  action: "reminder_sent" | "escalated";
  to: string[];
  subject: string;
  lines: string[];
  /** The worker's reminders link to the accreditation in the app. */
  link?: { label: string; url: string };
}

function days(count: number): string {
  return `${count} ${count === 1 ? "day" : "days"}`;
}

/** Every reminder that is due today and has not been sent. Read-only, so it doubles as a dry run. */
export const due = internalQuery({
  args: { today: v.string() },
  handler: async (ctx, args): Promise<Reminder[]> => {
    // The admin's setting (decision AD47); a type's own value, if ever set, wins.
    const escalationDays = await escalateAfterDays(ctx);
    const types = await ctx.db.query("accreditation_types").collect();
    const typeById = new Map(types.map((type) => [type._id, type]));
    const longestLead = Math.max(0, ...types.flatMap((type) => type.reminder_days));
    const horizon = addDays(args.today, longestLead);

    // Verified versions that are inside a reminder window or already expired.
    const versions = await ctx.db
      .query("whs_record_versions")
      .withIndex("by_state_and_expires", (q) =>
        q.eq("state", "verified").gte("expires", "0").lte("expires", horizon),
      )
      .collect();

    const adminEmails = await enabledRecipientEmails(ctx);
    const managementEmails = (await ctx.db.query("users").collect())
      .filter(isManagementUser)
      .map((user) => user.email);

    const reminders: Reminder[] = [];

    for (const version of versions) {
      if (version.expires === undefined || version.verified_at === undefined) continue;

      const record = await ctx.db.get(version.record_id);
      if (record === null) continue;

      // A renewal is already waiting for the office: the worker has done their part.
      const siblings = await ctx.db
        .query("whs_record_versions")
        .withIndex("by_record", (q) => q.eq("record_id", record._id))
        .collect();
      if (siblings.some((sibling) => sibling.state === "pending")) continue;

      const type = typeById.get(record.type_id);
      const worker = await ctx.db.get(record.worker_id);
      const responsible = (await ctx.db.get(record.responsible_user_id)) ?? worker;
      // A removed type is no longer asked for, so its evidence isn't chased either (decision AD31).
      if (type === undefined || type.archived || worker === null || responsible === null) continue;

      const planned = planReminders({
        today: args.today,
        expires: version.expires,
        verifiedDate: businessToday(version.verified_at),
        reminderDays: type.reminder_days,
        escalateAfterDays: type.escalate_after_days ?? escalationDays,
      });
      if (planned.length === 0) continue;

      const logged = await ctx.db
        .query("whs_audit")
        .withIndex("by_version_key", (q) => q.eq("version_id", version._id))
        .collect();
      const sent = new Set(logged.flatMap((row) => (row.key === undefined ? [] : [row.key])));

      const expiryDate = formatLongDate(version.expires);
      const workerName = worker.name ?? worker.email;
      const responsibleName = responsible.name ?? responsible.email;
      const subcontractor =
        worker.subcontractor_id === undefined ? null : await ctx.db.get(worker.subcontractor_id);

      const link = { label: "Open it in the app", url: accreditationLink(record.type_id) };
      const add = (reminder: Omit<Reminder, "record_id" | "version_id">) => {
        if (reminder.to.length === 0 || sent.has(reminder.key)) return;
        reminders.push({ record_id: record._id, version_id: version._id, ...reminder });
      };

      for (const candidate of planned) {
        if (candidate.kind === "pre") {
          const left = candidate.daysLeft ?? 0;
          add({
            key: `${candidate.key}:worker`,
            action: "reminder_sent",
            to: [responsible.email],
            subject: `Your ${type.name} expires on ${expiryDate}`,
            lines: [
              `Hi ${responsibleName},`,
              left === 0
                ? `Your ${type.name} expires today (${expiryDate}).`
                : `Your ${type.name} expires on ${expiryDate}, in ${days(left)}.`,
              "Please sign in to the Western USI InstallFlow app and upload a newer copy so it can be checked before it expires.",
            ],
            link,
          });
        } else if (candidate.kind === "overdue") {
          const overdue = candidate.overdueDays ?? 0;
          add({
            key: `${candidate.key}:worker`,
            action: "reminder_sent",
            to: [responsible.email],
            subject: `Your ${type.name} has expired`,
            lines: [
              `Hi ${responsibleName},`,
              `Your ${type.name} expired on ${expiryDate}, ${days(overdue)} ago.`,
              "Please sign in to the Western USI InstallFlow app and upload a newer copy as soon as you can. You'll get this reminder each week until it's renewed.",
            ],
            link,
          });
          add({
            key: `${candidate.key}:admin`,
            action: "reminder_sent",
            to: adminEmails,
            subject: `${workerName}: ${type.name} has expired`,
            lines: [
              `${workerName}'s ${type.name} expired on ${expiryDate}, ${days(overdue)} ago.`,
              "They have been asked to upload a newer copy.",
            ],
          });
        } else {
          const overdue = candidate.overdueDays ?? 0;
          add({
            key: candidate.key,
            action: "escalated",
            to: managementEmails,
            subject: `Escalation: ${workerName}'s ${type.name} is ${days(overdue)} overdue`,
            link: managementLink(`/management/accreditations/${record._id}`),
            lines: [
              `${workerName}${subcontractor === null ? "" : ` (${subcontractor.name})`} has not renewed their ${type.name}, which expired on ${expiryDate} and is now ${days(overdue)} overdue.`,
              "They have been reminded each week. Please follow up with them.",
            ],
          });
        }
      }
    }

    return reminders;
  },
});

/** Records that a reminder went out, so the daily check will not send it again. */
export const logSent = internalMutation({
  args: {
    record_id: v.id("whs_records"),
    version_id: v.id("whs_record_versions"),
    key: v.string(),
    action: v.union(v.literal("reminder_sent"), v.literal("escalated")),
    details: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("whs_audit", args);
  },
});

/**
 * Sends everything due today. A reminder is logged only after its email went
 * out, so one that fails is simply tried again at the next check. Run by hand
 * with `npx convex run whsReminders:sweep` (this sends real emails; to see
 * what would go out first, run `whsReminders:due` with today's date).
 */
export const sweep = internalAction({
  args: {},
  handler: async (ctx): Promise<{ due: number; sent: number; failed: number }> => {
    const reminders = await ctx.runQuery(internal.whsReminders.due, { today: businessToday() });

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
        await ctx.runMutation(internal.whsReminders.logSent, {
          record_id: reminder.record_id,
          version_id: reminder.version_id,
          key: reminder.key,
          action: reminder.action,
          details: emailed.length > 0 ? `Emailed ${emailed.join(", ")}: ${reminder.subject}` : `Not emailed (recipients on the skip list): ${reminder.subject}`,
        });
        sent++;
      } catch (error) {
        failed++;
        console.error(`WHS reminder ${reminder.key} for ${reminder.version_id} was not sent`, error);
      }
    }

    return { due: reminders.length, sent, failed };
  },
});

/**
 * The hourly cron's entry point. Convex crons run on UTC, and the business's
 * 8am moves an hour against UTC with daylight saving, so it runs every hour and
 * does the work only in the 8am hour, business time.
 */
export const sweepAtEight = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    accreditations: { due: number; sent: number; failed: number };
    documents: { due: number; sent: number; failed: number };
    kits: { due: number; sent: number; failed: number };
    assets: { due: number; sent: number; failed: number };
  } | null> => {
    if (businessHour() !== SEND_HOUR) return null;
    // Off on the development deployment, so test data never emails anyone:
    //   npx convex env set WHS_REMINDERS_OFF true
    if (process.env.WHS_REMINDERS_OFF === "true") return null;
    const accreditations = await ctx.runAction(internal.whsReminders.sweep, {});
    // Document review and acknowledgement reminders (whsDocReminders.ts).
    const documents = await ctx.runAction(internal.whsDocReminders.sweep, {});
    // First-aid inspection reminders (whsKitReminders.ts).
    const kits = await ctx.runAction(internal.whsKitReminders.sweep, {});
    // Insurance and vehicle reminders (whsAssetReminders.ts).
    const assets = await ctx.runAction(internal.whsAssetReminders.sweep, {});
    return { accreditations, documents, kits, assets };
  },
});
