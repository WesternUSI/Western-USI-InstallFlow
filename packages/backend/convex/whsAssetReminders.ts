import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { enabledRecipientEmails } from "./emails";
import { entityName, INSURANCE_REMINDER_DAYS, INSURANCE_TYPE_LABELS } from "./insurance";
import { REGISTRATION_REMINDER_DAYS, SERVICE_REMINDER_DAYS, INSURANCE_REMINDER_DAYS as VEHICLE_INSURANCE_DAYS } from "./vehicles";
import { businessToday, formatLongDate } from "./whsDates";
import { planReminders } from "./whsStatus";
import { isManagementUser } from "./permissions";
import { managementLink } from "./whsLinks";
import { escalateAfterDays } from "./whsSettings";

/**
 * Insurance and vehicle reminders (framework 7), run by the 8am check
 * (`whsReminders.sweepAtEight`). Before the date: the responsible person (the
 * admin list when none is set). Once overdue: weekly to them and the admin
 * list. Escalated to management once after the admin's escalation setting (14 days by default, AD47). Keys include the date,
 * so a renewal or a new service starts afresh. Out-of-service vehicles are
 * not chased.
 */

const PAUSE_BETWEEN_EMAILS_MS = 600;

interface AssetReminder {
  kind: "insurance" | "vehicle";
  target_id: string;
  key: string;
  action: "reminder_sent" | "escalated";
  to: string[];
  subject: string;
  lines: string[];
  link?: { label: string; url: string };
}

function days(count: number) {
  return `${count} ${count === 1 ? "day" : "days"}`;
}

async function responsibleEmails(ctx: QueryCtx, userId: Id<"users"> | undefined, adminEmails: string[]) {
  const user = userId === undefined ? null : await ctx.db.get(userId);
  return user === null ? adminEmails : [user.email];
}

/** Reminders for one dated item, in the same shape for insurance and vehicles. */
function plan(input: {
  kind: AssetReminder["kind"];
  targetId: string;
  prefix: string;
  name: string;
  what: string;
  date: string;
  since: string;
  leadDays: number[];
  today: string;
  responsible: string[];
  admins: string[];
  management: string[];
  /** Days overdue before management is emailed (decision AD47). */
  escalateAfterDays: number;
  sent: Set<string>;
}): AssetReminder[] {
  const out: AssetReminder[] = [];
  const due = formatLongDate(input.date);
  for (const candidate of planReminders({
    today: input.today,
    expires: input.date,
    verifiedDate: input.since,
    reminderDays: input.leadDays,
    escalateAfterDays: input.escalateAfterDays,
  })) {
    const key = `${input.prefix}:${input.date}:${candidate.key}`;
    if (input.sent.has(key)) continue;
    const base = { kind: input.kind, target_id: input.targetId, key };
    if (candidate.kind === "pre") {
      out.push({
        ...base,
        action: "reminder_sent",
        to: input.responsible,
        subject: `${input.name}: ${input.what} due ${due}`,
        lines: [`${input.name}: ${input.what} is due on ${due}, in ${days(candidate.daysLeft ?? 0)}.`, "Please arrange it and update the WHS register."],
      });
    } else if (candidate.kind === "overdue") {
      out.push({
        ...base,
        action: "reminder_sent",
        to: [...new Set([...input.responsible, ...input.admins])],
        subject: `${input.name}: ${input.what} is overdue`,
        lines: [
          `${input.name}: ${input.what} was due on ${due}, ${days(candidate.overdueDays ?? 0)} ago.`,
          "Please update the WHS register. This reminder goes out each week until it's done.",
        ],
      });
    } else {
      out.push({
        ...base,
        action: "escalated",
        to: input.management,
        subject: `Escalation: ${input.name} ${input.what} is ${days(candidate.overdueDays ?? 0)} overdue`,
        link: managementLink(`/management/${input.kind === "insurance" ? "insurance" : "vehicles"}/${input.targetId}`),
        lines: [`${input.name}: ${input.what} was due on ${due} and is now ${days(candidate.overdueDays ?? 0)} overdue.`, "Reminders have gone out each week. Please follow up."],
      });
    }
  }
  return out.filter((reminder) => reminder.to.length > 0);
}

/** Everything due today and not yet sent. Read-only, so it doubles as a dry run. */
export const due = internalQuery({
  args: { today: v.string() },
  handler: async (ctx, args): Promise<AssetReminder[]> => {
    const escalationDays = await escalateAfterDays(ctx); // decision AD47
    const admins = await enabledRecipientEmails(ctx);
    // Anyone with management access: the management role, or an admin given it (decision AD43).
    const management = (await ctx.db.query("users").collect()).filter(isManagementUser).map((user) => user.email);
    const reminders: AssetReminder[] = [];

    const policies = await ctx.db.query("insurance_policies").withIndex("by_archived", (q) => q.eq("archived", false)).collect();
    for (const policy of policies) {
      const certificates = await ctx.db
        .query("insurance_certificates")
        .withIndex("by_policy", (q) => q.eq("policy_id", policy._id))
        .collect();
      if (certificates.some((certificate) => certificate.state === "pending")) continue;
      const current = [...certificates].reverse().find((certificate) => certificate.state === "verified");
      if (current === undefined) continue;
      const sent = new Set(
        (await ctx.db.query("insurance_audit").withIndex("by_policy", (q) => q.eq("policy_id", policy._id)).collect()).flatMap((row) =>
          row.key === undefined ? [] : [row.key],
        ),
      );
      reminders.push(
        ...plan({
          kind: "insurance",
          targetId: policy._id,
          prefix: "insurance",
          name: `${await entityName(ctx, policy.subcontractor_id)} ${INSURANCE_TYPE_LABELS[policy.insurance_type]}`,
          what: "the policy",
          date: current.expires,
          since: businessToday(current.verified_at ?? current._creationTime),
          leadDays: INSURANCE_REMINDER_DAYS,
          today: args.today,
          responsible: await responsibleEmails(ctx, policy.responsible_user_id, admins),
          admins,
          management,
          escalateAfterDays: escalationDays,
          sent,
        }),
      );
    }

    const vehicles = await ctx.db.query("vehicles").withIndex("by_archived", (q) => q.eq("archived", false)).collect();
    for (const vehicle of vehicles) {
      if (vehicle.out_of_service) continue;
      const sent = new Set(
        (await ctx.db.query("vehicle_audit").withIndex("by_vehicle", (q) => q.eq("vehicle_id", vehicle._id)).collect()).flatMap((row) =>
          row.key === undefined ? [] : [row.key],
        ),
      );
      const responsible = await responsibleEmails(ctx, vehicle.responsible_user_id, admins);
      const name = `Vehicle ${vehicle.registration}`;
      const added = businessToday(vehicle._creationTime);
      const common = { kind: "vehicle" as const, targetId: vehicle._id, name, today: args.today, responsible, admins, management, escalateAfterDays: escalationDays, sent };
      reminders.push(
        ...plan({ ...common, prefix: "registration", what: "registration", date: vehicle.registration_expiry, since: added, leadDays: REGISTRATION_REMINDER_DAYS }),
        ...plan({ ...common, prefix: "service", what: "service", date: vehicle.next_service, since: vehicle.last_service, leadDays: SERVICE_REMINDER_DAYS }),
        ...plan({ ...common, prefix: "insurance", what: "insurance", date: vehicle.insurance_expiry, since: added, leadDays: VEHICLE_INSURANCE_DAYS }),
      );
    }
    return reminders;
  },
});

export const logSent = internalMutation({
  args: { kind: v.union(v.literal("insurance"), v.literal("vehicle")), target_id: v.string(), key: v.string(), action: v.union(v.literal("reminder_sent"), v.literal("escalated")), details: v.string() },
  handler: async (ctx, args) => {
    if (args.kind === "insurance") {
      const policyId = ctx.db.normalizeId("insurance_policies", args.target_id);
      if (policyId) await ctx.db.insert("insurance_audit", { policy_id: policyId, action: args.action, key: args.key, details: args.details });
    } else {
      const vehicleId = ctx.db.normalizeId("vehicles", args.target_id);
      if (vehicleId) await ctx.db.insert("vehicle_audit", { vehicle_id: vehicleId, action: args.action, key: args.key, details: args.details });
    }
  },
});

/** Sends everything due today. Called by `whsReminders.sweepAtEight`. */
export const sweep = internalAction({
  args: {},
  handler: async (ctx): Promise<{ due: number; sent: number; failed: number }> => {
    const reminders = await ctx.runQuery(internal.whsAssetReminders.due, { today: businessToday() });
    let sent = 0;
    let failed = 0;
    for (const [index, reminder] of reminders.entries()) {
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN_EMAILS_MS));
      try {
        const emailed: string[] = await ctx.runAction(internal.email.sendWhsEmail, { to: reminder.to, subject: reminder.subject, lines: reminder.lines, link: reminder.link });
        await ctx.runMutation(internal.whsAssetReminders.logSent, {
          kind: reminder.kind,
          target_id: reminder.target_id,
          key: reminder.key,
          action: reminder.action,
          details: emailed.length > 0 ? `Emailed ${emailed.join(", ")}: ${reminder.subject}` : `Not emailed (recipients on the skip list): ${reminder.subject}`,
        });
        sent++;
      } catch (error) {
        failed++;
        console.error(`Reminder ${reminder.key} was not sent`, error);
      }
    }
    return { due: reminders.length, sent, failed };
  },
});
