/**
 * Values that are computed from a row but stored alongside it.
 *
 * Status needs to be filtered *inside* an index: a Convex query reads one
 * page and any filtering done afterwards throws rows away, which leaves the
 * page short — or empty — while matches sit further down the table. Writing
 * these keys at insert/update time lets the index do the work instead.
 *
 * Work order search text is the same story — `workorders` search is index
 * backed and paginated. Sites search is not: at the table's current scale
 * `sites.list` just collects everything and filters in memory (see
 * `matchesSearch` in convex/sites.ts), so there's no derived search text to
 * keep in sync there.
 *
 * Every mutation that changes the inputs below must recompute the keys.
 */

export type WorkOrderStatus =
  | "completed"
  | "missing_site"
  | "pending"
  | "allocated"
  | "not_allocated";

interface WorkOrderStatusInput {
  current_status: "pending" | "in_progress" | "completed";
  missing_value: boolean;
  assigned_team: string[];
}

/**
 * Priority order matters: a completed install stays completed even if its site
 * never matched, and an unmatched row is flagged before allocation.
 */
export function deriveWorkOrderStatus(workOrder: WorkOrderStatusInput): WorkOrderStatus {
  if (workOrder.current_status === "completed") return "completed";
  if (workOrder.missing_value) return "missing_site";
  if (workOrder.current_status === "in_progress") return "pending";
  if (workOrder.assigned_team.length > 0) return "allocated";
  return "not_allocated";
}

export type SiteDetailStatus = "completed" | "incomplete" | "missing";

interface SiteDetailInput {
  site_img: unknown[];
  location?: string;
  install_notes?: string;
  equipment_needed: string[];
}

/** The four fields the Edit Site Details screen fills in. */
export function deriveSiteDetailStatus(site: SiteDetailInput): SiteDetailStatus {
  const filled = [
    site.site_img.length > 0,
    (site.location ?? "").trim() !== "",
    (site.install_notes ?? "").trim() !== "",
    site.equipment_needed.length > 0,
  ].filter(Boolean).length;

  if (filled === 0) return "missing";
  if (filled === 4) return "completed";
  return "incomplete";
}

/**
 * Free-text search is matched in memory across several columns rather than
 * through a Convex search index: a search index carries exactly one search
 * field, so covering location, panel id and advertiser at once would mean
 * denormalising them into a combined column. Scanning is bounded by the
 * transaction limits (32,000 documents / 16 MiB) and gives plain substring
 * matching, which a tokenised index cannot.
 */
export function matchesTerm(fields: (string | undefined)[], search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (needle === "") return true;

  return fields.some((field) => field !== undefined && field.toLowerCase().includes(needle));
}

