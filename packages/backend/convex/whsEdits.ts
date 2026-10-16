import { ConvexError } from "convex/values";

/**
 * Correcting a register record (framework 11, decision AD32): the admin
 * gives a reason, and the trail keeps what changed from what to what, who
 * changed it and when. Archiving works the same way: a reason, then the
 * record is hidden from use but never deleted.
 */

const MAX_REASON = 500;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function checkReason(reason: string, action: "change" | "archive" = "change") {
  const trimmed = reason.trim();
  if (trimmed === "") {
    throw new ConvexError(action === "change" ? "Enter the reason for the change." : "Enter the reason for archiving it.");
  }
  if (trimmed.length > MAX_REASON) throw new ConvexError(`The reason can be up to ${MAX_REASON} characters.`);
  return trimmed;
}

function show(value: unknown, kind: "text" | "date" | "flag" | "long"): string {
  if (value === undefined || value === null || value === "") return "none";
  if (kind === "flag") return value ? "yes" : "no";
  if (kind === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return `${day} ${MONTHS[month - 1]} ${year}`;
  }
  return String(value);
}

export interface FieldChange {
  label: string;
  before: unknown;
  after: unknown;
  /** "long" fields (notes) are reported as changed without their text. */
  kind?: "text" | "date" | "flag" | "long";
}

/**
 * "Expiry date: 1 Mar 2027 → 1 Apr 2027; Notes changed. Reason: typo." Throws
 * when nothing actually changed, so the trail never records an empty edit.
 */
export function describeEdit(changes: FieldChange[], reason: string) {
  const lines = changes
    .filter((change) => (change.before ?? "") !== (change.after ?? ""))
    .map((change) =>
      change.kind === "long"
        ? `${change.label} changed`
        : `${change.label}: ${show(change.before, change.kind ?? "text")} → ${show(change.after, change.kind ?? "text")}`,
    );
  if (lines.length === 0) throw new ConvexError("Nothing was changed.");
  return `${lines.join("; ")}. Reason: ${reason}`;
}
