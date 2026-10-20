import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { enabledRecipientEmails } from "./emails";
import { documentIsFor, isManagementUser, mustAcknowledgeDocuments } from "./permissions";
import { businessToday, formatLongDate } from "./whsDates";
import { documentLink, managementLink } from "./whsLinks";
import { daysBetween, planReminders } from "./whsStatus";
import { escalateAfterDays } from "./whsSettings";

/**
 * Document reminders, by email, run by the same 8am check as accreditations
 * (`whsReminders.sweepAtEight`):
 *   - review reminders (framework 7): SWMS and policies 30, 14 and 7 days
 *     before review, SDS 60 and 30, to the responsible person (the admin list
 *     when none is set); weekly once overdue, to them and the admin list;
 *     escalated to management once after the escalation setting (14 days by default, AD47).
 *   - acknowledgement reminders (decision D7): each worker who hasn't
 *     acknowledged a current version is emailed, then weekly, in one email
 *     listing everything they still have to sign.
 * Each one is logged in `whs_document_audit` with a key so it never repeats.
 */

const REVIEW_DAYS: Record<Doc<"whs_documents">["kind"], number[]> = {
  swms: [30, 14, 7],
  document: [30, 14, 7],
  sds: [60, 30],
};


const PAUSE_BETWEEN_EMAILS_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function days(count: number): string {
  return `${count} ${count === 1 ? "day" : "days"}`;
}

const logEntry = v.object({
  document_id: v.id("whs_documents"),
  version_id: v.id("whs_document_versions"),
  key: v.string(),
});

interface DocReminder {
  /** What to log once it is sent: one row per document version covered. */
  log: { document_id: Id<"whs_documents">; version_id: Id<"whs_document_versions">; key: string }[];
  action: "reminder_sent" | "escalated";
  to: string[];
  subject: string;
  lines: string[];
  link?: { label: string; url: string };
}

/** Every document reminder due today and not yet sent. Read-only, so it doubles as a dry run. */
export const due = internalQuery({
  args: { today: v.string() },
  handler: async (ctx, args): Promise<DocReminder[]> => {
    const escalationDays = await escalateAfterDays(ctx); // decision AD47
    const documents = (await ctx.db.query("whs_documents").collect()).filter((document) => !document.archived);
    const current = await ctx.db
      .query("whs_document_versions")
      .withIndex("by_state_and_review", (q) => q.eq("state", "current"))
      .collect();
    const currentByDocument = new Map(current.map((version) => [version.document_id, version]));

    const users = await ctx.db.query("users").collect();
    const adminEmails = await enabledRecipientEmails(ctx);
    const managementEmails = users.filter(isManagementUser).map((user) => user.email);

    const reminders: DocReminder[] = [];

    const sentKeys = async (versionId: Id<"whs_document_versions">) => {
      const logged = await ctx.db
        .query("whs_document_audit")
        .withIndex("by_version_key", (q) => q.eq("version_id", versionId))
        .collect();
      return new Set(logged.flatMap((row) => (row.key === undefined ? [] : [row.key])));
    };

    // Review reminders (framework 7).
    for (const document of documents) {
      const version = currentByDocument.get(document._id);
      if (version === undefined || version.review_date === undefined) continue;

      const planned = planReminders({
        today: args.today,
        expires: version.review_date,
        verifiedDate: businessToday(version._creationTime),
        reminderDays: REVIEW_DAYS[document.kind],
        escalateAfterDays: escalationDays,
      });
      if (planned.length === 0) continue;

      const sent = await sentKeys(version._id);
      const responsible =
        document.responsible_user_id === undefined ? null : await ctx.db.get(document.responsible_user_id);
      const responsibleTo = responsible === null ? adminEmails : [responsible.email];
      const reviewDate = formatLongDate(version.review_date);
      const name = `${document.title} (${version.version})`;

      const add = (key: string, reminder: Omit<DocReminder, "log">) => {
        if (reminder.to.length === 0 || sent.has(key)) return;
        reminders.push({ log: [{ document_id: document._id, version_id: version._id, key }], ...reminder });
      };

      for (const candidate of planned) {
        if (candidate.kind === "pre") {
          const left = candidate.daysLeft ?? 0;
          add(`review-${candidate.key}:responsible`, {
            action: "reminder_sent",
            to: responsibleTo,
            subject: `${document.title} is due for review on ${reviewDate}`,
            lines: [
              left === 0
                ? `${name} is due for review today (${reviewDate}).`
                : `${name} is due for review on ${reviewDate}, in ${days(left)}.`,
              "Please review it and issue an updated version, or confirm the current one with a new review date.",
            ],
          });
        } else if (candidate.kind === "overdue") {
          const overdue = candidate.overdueDays ?? 0;
          const to = [...new Set([...responsibleTo, ...adminEmails])];
          add(`review-${candidate.key}:responsible`, {
            action: "reminder_sent",
            to,
            subject: `${document.title} is overdue for review`,
            lines: [
              `${name} was due for review on ${reviewDate}, ${days(overdue)} ago.`,
              "Please review it and issue an updated version. You'll get this reminder each week until it's done.",
            ],
          });
        } else {
          add(`review-${candidate.key}`, {
            action: "escalated",
            to: managementEmails,
            subject: `Escalation: ${document.title} is ${days(candidate.overdueDays ?? 0)} overdue for review`,
            link: managementLink(`/management/documents/${document._id}`),
            lines: [
              `${name} was due for review on ${reviewDate} and is now ${days(candidate.overdueDays ?? 0)} overdue.`,
              "Reminders have gone out each week. Please follow up.",
            ],
          });
        }
      }
    }

    // Acknowledgement reminders (decision D7): one email per worker.
    const toAcknowledge = documents.flatMap((document) => {
      const version = currentByDocument.get(document._id);
      return document.acknowledgement_required && version !== undefined ? [{ document, version }] : [];
    });
    if (toAcknowledge.length > 0) {
      const workers = users.filter(mustAcknowledgeDocuments);
      const sentByVersion = new Map<Id<"whs_document_versions">, Set<string>>();
      for (const { version } of toAcknowledge) sentByVersion.set(version._id, await sentKeys(version._id));

      for (const worker of workers) {
        const outstanding: DocReminder["log"] = [];
        const titles: string[] = [];

        for (const { document, version } of toAcknowledge) {
          // Only the people it is for are asked (decision AD33).
          if (!documentIsFor(document, worker)) continue;
          const acknowledged = await ctx.db
            .query("whs_acknowledgements")
            .withIndex("by_version_and_worker", (q) => q.eq("version_id", version._id).eq("worker_id", worker._id))
            .unique();
          if (acknowledged !== null) continue;

          // Week 0 on the first check after the version is issued, then once a week.
          const week = Math.max(0, Math.floor(daysBetween(businessToday(version._creationTime), args.today) / 7));
          const key = `ack-${week}:${worker._id}`;
          if (sentByVersion.get(version._id)?.has(key)) continue;

          outstanding.push({ document_id: document._id, version_id: version._id, key });
          titles.push(`${document.title} (${version.version})`);
        }

        if (outstanding.length === 0) continue;
        const one = outstanding.length === 1;
        reminders.push({
          log: outstanding,
          action: "reminder_sent",
          to: [worker.email],
          subject: one ? `Please read and sign ${titles[0]}` : `${outstanding.length} safety documents to read and sign`,
          lines: [
            `Hi ${worker.name ?? worker.email},`,
            one
              ? `Please read and acknowledge ${titles[0]} in the Western USI InstallFlow app.`
              : `Please read and acknowledge these in the Western USI InstallFlow app: ${titles.join("; ")}.`,
            "Open Safety in the app, then Needs Attention. You'll get this reminder each week until they are signed.",
          ],
          link: one ? { label: "Open it in the app", url: documentLink(outstanding[0].document_id) } : undefined,
        });
      }
    }

    return reminders;
  },
});

export const logSent = internalMutation({
  args: {
    log: v.array(logEntry),
    action: v.union(v.literal("reminder_sent"), v.literal("escalated")),
    details: v.string(),
  },
  handler: async (ctx, args) => {
    for (const entry of args.log) {
      await ctx.db.insert("whs_document_audit", { ...entry, action: args.action, details: args.details });
    }
  },
});

/**
 * Sends every document reminder due today. Called by `whsReminders.sweepAtEight`;
 * to see what would go out first, run `whsDocReminders:due` with today's date.
 */
export const sweep = internalAction({
  args: {},
  handler: async (ctx): Promise<{ due: number; sent: number; failed: number }> => {
    const reminders = await ctx.runQuery(internal.whsDocReminders.due, { today: businessToday() });

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
        await ctx.runMutation(internal.whsDocReminders.logSent, {
          log: reminder.log,
          action: reminder.action,
          details: emailed.length > 0 ? `Emailed ${emailed.join(", ")}: ${reminder.subject}` : `Not emailed (recipients on the skip list): ${reminder.subject}`,
        });
        sent++;
      } catch (error) {
        failed++;
        console.error(`Document reminder "${reminder.subject}" was not sent`, error);
      }
    }
    return { due: reminders.length, sent, failed };
  },
});

