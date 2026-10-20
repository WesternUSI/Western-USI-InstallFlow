import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { enabledRecipientEmails } from "./emails";
import { KIT_REMINDER_DAYS } from "./kits";
import { addDays, businessToday, formatLongDate } from "./whsDates";
import { planReminders } from "./whsStatus";
import { isManagementUser } from "./permissions";
import { managementLink } from "./whsLinks";

/**
 * First-aid inspection reminders (framework 7), run by the same 8am check as
 * accreditations (`whsReminders.sweepAtEight`): 14 and 7 days before, to the
 * kit's responsible person (the admin list when none is set); once overdue,
 * weekly to them and the admin list; escalated to management once after 14
 * days. Keys include the due date, so each inspection cycle starts afresh.
 */

const ESCALATE_AFTER_DAYS = 14;
const PAUSE_BETWEEN_EMAILS_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function days(count: number): string {
  return `${count} ${count === 1 ? "day" : "days"}`;
}

interface KitReminder {
  kit_id: Id<"first_aid_kits">;
  key: string;
  action: "reminder_sent" | "escalated";
  to: string[];
  subject: string;
  lines: string[];
  link?: { label: string; url: string };
}

/** Every kit reminder due today and not yet sent. Read-only, so it doubles as a dry run. */
export const due = internalQuery({
  args: { today: v.string() },
  handler: async (ctx, args): Promise<KitReminder[]> => {
    const horizon = addDays(args.today, Math.max(...KIT_REMINDER_DAYS));
    const kits = (
      await ctx.db
        .query("first_aid_kits")
        .withIndex("by_next_inspection", (q) => q.lte("next_inspection", horizon))
        .collect()
    ).filter((kit) => !kit.archived);

    const adminEmails = await enabledRecipientEmails(ctx);
    const managementEmails = (await ctx.db.query("users").collect())
      .filter(isManagementUser)
      .map((user) => user.email);

    const reminders: KitReminder[] = [];
    for (const kit of kits) {
      const planned = planReminders({
        today: args.today,
        expires: kit.next_inspection,
        verifiedDate: kit.last_inspection ?? businessToday(kit._creationTime),
        reminderDays: KIT_REMINDER_DAYS,
        escalateAfterDays: ESCALATE_AFTER_DAYS,
      });
      if (planned.length === 0) continue;

      const responsible = kit.responsible_user_id === undefined ? null : await ctx.db.get(kit.responsible_user_id);
      const responsibleTo = responsible === null ? adminEmails : [responsible.email];
      const greeting = responsible === null ? [] : [`Hi ${responsible.name ?? responsible.email},`];
      const dueDate = formatLongDate(kit.next_inspection);
      const name = `First-aid kit ${kit.code} (${kit.location})`;

      for (const candidate of planned) {
        const key =
          candidate.kind === "escalation"
            ? `${kit.next_inspection}:${candidate.key}`
            : `${kit.next_inspection}:${candidate.key}:responsible`;
        const sent = await ctx.db
          .query("kit_audit")
          .withIndex("by_kit_and_key", (q) => q.eq("kit_id", kit._id).eq("key", key))
          .first();
        if (sent !== null) continue;

        if (candidate.kind === "pre") {
          const left = candidate.daysLeft ?? 0;
          reminders.push({
            kit_id: kit._id,
            key,
            action: "reminder_sent",
            to: responsibleTo,
            subject: `First-aid kit ${kit.code} inspection due ${dueDate}`,
            lines: [
              ...greeting,
              left === 0
                ? `${name} is due for its inspection today (${dueDate}).`
                : `${name} is due for its inspection on ${dueDate}, in ${days(left)}.`,
              "Open Safety in the Western USI InstallFlow app, then First-Aid Kits, and complete the inspection.",
            ],
          });
        } else if (candidate.kind === "overdue") {
          reminders.push({
            kit_id: kit._id,
            key,
            action: "reminder_sent",
            to: [...new Set([...responsibleTo, ...adminEmails])],
            subject: `First-aid kit ${kit.code} inspection is overdue`,
            lines: [
              `${name} was due for its inspection on ${dueDate}, ${days(candidate.overdueDays ?? 0)} ago.`,
              "Please complete it in the Western USI InstallFlow app. This reminder goes out each week until it's done.",
            ],
          });
        } else {
          reminders.push({
            kit_id: kit._id,
            key,
            action: "escalated",
            to: managementEmails,
            subject: `Escalation: first-aid kit ${kit.code} inspection is ${days(candidate.overdueDays ?? 0)} overdue`,
            link: managementLink(`/management/kits/${kit._id}`),
            lines: [
              `${name} was due for its inspection on ${dueDate} and is now ${days(candidate.overdueDays ?? 0)} overdue${responsible === null ? "" : ` (responsible: ${responsible.name ?? responsible.email})`}.`,
              "Reminders have gone out each week. Please follow up.",
            ],
          });
        }
      }
    }
    return reminders.filter((reminder) => reminder.to.length > 0);
  },
});

export const logSent = internalMutation({
  args: {
    kit_id: v.id("first_aid_kits"),
    key: v.string(),
    action: v.union(v.literal("reminder_sent"), v.literal("escalated")),
    details: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("kit_audit", args);
  },
});

/** Sends every kit reminder due today. Called by `whsReminders.sweepAtEight`. */
export const sweep = internalAction({
  args: {},
  handler: async (ctx): Promise<{ due: number; sent: number; failed: number }> => {
    const reminders = await ctx.runQuery(internal.whsKitReminders.due, { today: businessToday() });

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
        await ctx.runMutation(internal.whsKitReminders.logSent, {
          kit_id: reminder.kit_id,
          key: reminder.key,
          action: reminder.action,
          details: emailed.length > 0 ? `Emailed ${emailed.join(", ")}: ${reminder.subject}` : `Not emailed (recipients on the skip list): ${reminder.subject}`,
        });
        sent++;
      } catch (error) {
        failed++;
        console.error(`Kit reminder ${reminder.key} for ${reminder.kit_id} was not sent`, error);
      }
    }
    return { due: reminders.length, sent, failed };
  },
});
