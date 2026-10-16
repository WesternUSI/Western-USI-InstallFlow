import { RELEASE_TIME_ZONE } from "./releaseTime";

/** Dates in the WHS register are the business's local calendar dates, as `YYYY-MM-DD`. */

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: RELEASE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const hourFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: RELEASE_TIME_ZONE,
  hour: "numeric",
  hourCycle: "h23",
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The business's local date at `now`, `YYYY-MM-DD`. */
export function businessToday(now = Date.now()): string {
  return dateFormatter.format(now);
}

/** The business's local hour (0-23) at `now`. */
export function businessHour(now = Date.now()): number {
  return Number(hourFormatter.format(now));
}

/** "2026-12-12" -> "12 Dec 2026", for emails. */
export function formatLongDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day} ${MONTHS[Number(month) - 1]} ${year}`;
}

/** `iso` plus `days` calendar days. */
export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** `iso` plus `months` calendar months, kept inside the month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}
