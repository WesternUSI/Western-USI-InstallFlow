/** Mirrors the derived detail status returned by `api.sites.list`. */
export type SiteDetailStatus = "completed" | "incomplete" | "missing";

/** Row pills. The tabs use their own, slightly longer wording. */
export const SITE_DETAIL_STATUS_LABELS: Record<SiteDetailStatus, string> = {
  completed: "Complete",
  incomplete: "Incomplete",
  missing: "Missing Site",
};

export const SITE_DETAIL_STATUS_CLASSES: Record<SiteDetailStatus, string> = {
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  incomplete: "bg-orange-50 text-orange-700 ring-orange-200",
  missing: "bg-red-50 text-red-700 ring-red-200",
};

export const SITE_DETAIL_STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "incomplete", label: "Incomplete" },
  { value: "completed", label: "Completed" },
  { value: "missing", label: "Missing" },
] as const;

export type SiteDetailStatusTab = (typeof SITE_DETAIL_STATUS_TABS)[number]["value"];
