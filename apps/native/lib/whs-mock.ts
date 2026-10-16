// WHS status styles and the wording of the first-aid kit checks.

export type WhsStatus =
  | "current"
  | "due-soon"
  | "expired"
  | "missing"
  | "awaiting-verification"
  | "action-required"
  | "renewal-in-progress"
  | "overdue";

export const STATUS_STYLES: Record<WhsStatus, { label: string; background: string; color: string }> = {
  current: { label: "Current", background: "#efffef", color: "#16a34a" },
  "due-soon": { label: "Due Soon", background: "#eff6ff", color: "#2563eb" },
  expired: { label: "Expired", background: "#ffefef", color: "#dc2626" },
  overdue: { label: "Overdue", background: "#ffefef", color: "#dc2626" },
  missing: { label: "Missing", background: "#ffefef", color: "#dc2626" },
  "action-required": { label: "Action Required", background: "#ffefef", color: "#dc2626" },
  "awaiting-verification": { label: "Awaiting Verification", background: "#fffdd0", color: "#e3ad04" },
  "renewal-in-progress": { label: "Renewal in Progress", background: "#fffdd0", color: "#e3ad04" },
};

// ---------------------------------------------------------------------------
// First-aid kit inspection
// ---------------------------------------------------------------------------

export type KitCheck = {
  id: string;
  title: string;
  description: string;
  icon: "cube-outline" | "shield-checkmark-outline" | "list-outline" | "time-outline" | "refresh" | "shield-outline" | "sparkles-outline" | "settings-outline";
};

export type KitAnswer = "pass" | "action" | "na";

// The eight checks from section 4F of the WHS framework. The ids match
// `KIT_CHECK_IDS` in the backend's kits.ts.
export const KIT_CHECKS: KitCheck[] = [
  { id: "present", title: "Kit present and accessible", description: "All required items are present in the kit.", icon: "cube-outline" },
  { id: "case", title: "Case and seals undamaged", description: "Case is intact and seals are not broken.", icon: "shield-checkmark-outline" },
  { id: "contents", title: "Contents match required inventory", description: "Contents match the required inventory list.", icon: "list-outline" },
  { id: "expired", title: "No expired items", description: "No items are past their expiry date.", icon: "time-outline" },
  { id: "replenished", title: "Used items replenished", description: "Replaced any used or consumed items.", icon: "refresh" },
  { id: "sterile", title: "Sterile items sealed", description: "All sterile items are sealed and within expiry.", icon: "shield-outline" },
  { id: "emergency", title: "Emergency information current", description: "Emergency info is up to date and visible.", icon: "sparkles-outline" },
  { id: "clean", title: "Kit clean and serviceable", description: "Kit is clean, intact and ready for use.", icon: "settings-outline" },
];
