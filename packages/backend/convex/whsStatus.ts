/**
 * The status of a worker's accreditation, calculated and never chosen by hand
 * (framework 6). Everything that shows a status — the installer app, the admin
 * dashboard, reminder emails — calls this, so they cannot disagree.
 *
 * The rules, with the decisions in docs/reference/whs-decisions.md:
 *   - no upload at all                          -> missing                 (S4)
 *   - an upload waiting for an admin:
 *       the first ever                          -> awaiting-verification   (S1)
 *       a renewal of a verified one             -> renewal-in-progress     (S1)
 *   - the latest upload was rejected            -> action-required         (S3)
 *   - otherwise the verified version's dates decide:
 *       past its expiry                         -> expired
 *       within the due-soon window of expiry    -> due-soon                (S2)
 *       no expiry, or further out               -> current
 *
 * Pure on purpose: no database, no clock. The caller passes `today` (the
 * business's local date, `YYYY-MM-DD`) and the versions oldest first.
 */

export type AccreditationStatus =
  | "current"
  | "due-soon"
  | "expired"
  | "missing"
  | "awaiting-verification"
  | "action-required"
  | "renewal-in-progress";

export type VersionState = "pending" | "verified" | "rejected" | "superseded";

export interface StatusVersion {
  state: VersionState;
  /** `YYYY-MM-DD`. */
  expires?: string;
  no_expiry: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

/**
 * How many days before expiry a record counts as due soon: the first reminder,
 * i.e. the longest lead time (decision S2). No reminders means never "due soon".
 */
export function dueSoonWindowDays(reminderDays: readonly number[]): number {
  return reminderDays.length === 0 ? 0 : Math.max(...reminderDays);
}

export function deriveAccreditationStatus(
  versions: readonly StatusVersion[],
  today: string,
  dueSoonDays: number,
): AccreditationStatus {
  const latest = versions[versions.length - 1];
  if (latest === undefined) return "missing";

  const current = [...versions].reverse().find((version) => version.state === "verified");

  if (versions.some((version) => version.state === "pending")) {
    return current === undefined ? "awaiting-verification" : "renewal-in-progress";
  }

  if (latest.state === "rejected") return "action-required";

  // Only reachable with a verified version: every version is pending, rejected,
  // superseded or verified, and a superseded one always has a newer verified one.
  if (current === undefined || current.no_expiry || current.expires === undefined) return "current";

  const daysLeft = daysBetween(today, current.expires);
  if (daysLeft < 0) return "expired";
  if (daysLeft <= dueSoonDays) return "due-soon";
  return "current";
}

export type ReminderKind = "pre" | "overdue" | "escalation";

export interface ReminderCandidate {
  /** Stable per reminder ("pre-60", "overdue-1", "escalated"), so a sent one is recognised. */
  key: string;
  kind: ReminderKind;
  daysLeft?: number;
  overdueDays?: number;
}

/**
 * Which reminders apply to a verified accreditation today (framework 7).
 * It lists everything currently applicable; the caller drops what it has
 * already sent.
 *
 *   - Before expiry, the reminder for each lead time (60, 30, 14, 7 days) applies
 *     from that day until the next lead time, so a missed day is caught up. A
 *     lead time the accreditation was already inside when it was verified is
 *     skipped (decision on reminders in docs/reference/whs-decisions.md).
 *   - Once expired, one notice a week applies: the first on the day after expiry.
 *   - After `escalateAfterDays` overdue, an escalation to management applies.
 */
export function planReminders(input: {
  today: string;
  expires: string;
  /** The day the evidence was verified. */
  verifiedDate: string;
  reminderDays: readonly number[];
  escalateAfterDays: number;
}): ReminderCandidate[] {
  const { today, expires, verifiedDate, reminderDays, escalateAfterDays } = input;
  const daysLeft = daysBetween(today, expires);
  const planned: ReminderCandidate[] = [];

  if (daysLeft >= 0) {
    const leadTimes = [...reminderDays].sort((a, b) => b - a);
    const leftAtVerification = daysBetween(verifiedDate, expires);

    leadTimes.forEach((lead, index) => {
      const nextShorter = leadTimes[index + 1] ?? -1;
      const inWindow = daysLeft <= lead && daysLeft > nextShorter;
      if (inWindow && leftAtVerification >= lead) {
        planned.push({ key: `pre-${lead}`, kind: "pre", daysLeft });
      }
    });
    return planned;
  }

  const overdueDays = -daysLeft;
  planned.push({ key: `overdue-${Math.floor((overdueDays - 1) / 7)}`, kind: "overdue", overdueDays });
  if (overdueDays >= escalateAfterDays) {
    planned.push({ key: "escalated", kind: "escalation", overdueDays });
  }
  return planned;
}
