/**
 * When a scheduled work order batch goes live.
 *
 * The business runs on Australian eastern time, so "release on the 14th" means
 * midnight on the 14th *there* — not wherever the admin's browser happens to
 * be, and not UTC. Convex schedules in absolute time, so a chosen date has to
 * be turned into an instant, and that instant shifts by an hour twice a year
 * with daylight saving.
 *
 * Shared by the backend and the admin panel so both agree on which dates are
 * still in the future.
 */
export const RELEASE_TIME_ZONE = "Australia/Sydney";

const zoneFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: RELEASE_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function zoneParts(ms: number) {
  const parts = zoneFormatter.formatToParts(new Date(ms));
  const read = (type: Intl.DateTimeFormatPartTypes) => {
    const part = parts.find((candidate) => candidate.type === type);
    return part === undefined ? 0 : Number(part.value);
  };

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/** The calendar date in the release zone at `ms`, as YYYY-MM-DD. */
export function releaseZoneDate(ms: number = Date.now()): string {
  const { year, month, day } = zoneParts(ms);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The release zone's offset from UTC at `ms`, in milliseconds. */
function zoneOffset(ms: number): number {
  const { year, month, day, hour, minute, second } = zoneParts(ms);
  // Parts have second resolution, so the instant is truncated to match before
  // the two are subtracted.
  return Date.UTC(year, month - 1, day, hour, minute, second) - Math.floor(ms / 1000) * 1000;
}

/**
 * Midnight of `date` (YYYY-MM-DD) in the release zone, as an epoch timestamp.
 *
 * The offset is sampled twice — once at the naive UTC guess, then again at the
 * instant that guess corrects to. A single pass is off by an hour on the two
 * days a year where the guess and the answer sit on opposite sides of a
 * daylight-saving switch.
 */
export function releaseTimestamp(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day);
  const corrected = guess - zoneOffset(guess);
  return guess - zoneOffset(corrected);
}

/** True when `date` (YYYY-MM-DD) is a later day than today in the release zone. */
export function isFutureReleaseDate(date: string): boolean {
  return date > releaseZoneDate();
}

/**
 * Tomorrow's date in the release zone, as YYYY-MM-DD.
 *
 * The earliest day a batch can be scheduled for — today's midnight has already
 * passed, and "today" is what importing now already does.
 */
export function nextReleaseZoneDate(): string {
  const [year, month, day] = releaseZoneDate().split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}
