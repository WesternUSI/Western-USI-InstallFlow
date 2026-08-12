/**
 * Values that are computed from a row but stored alongside it.
 *
 * Status and free-text search both need to be filtered *inside* an index. A
 * Convex query reads one page and any filtering done afterwards throws rows
 * away, which leaves the page short — or empty — while matches sit further
 * down the table. Writing these keys at insert/update time lets the index do
 * the work instead.
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

function joinSearchable(parts: (string | undefined)[]): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => part !== undefined && part !== "")
    .join(" ");
}

export function workOrderSearchText(workOrder: {
  site: string;
  panel_split: string;
  contracted_panel_id: string;
  advertiser_campaign: string;
  existing_advertiser?: string;
  panel_name: string;
  train_line?: string;
}): string {
  return joinSearchable([
    workOrder.site,
    workOrder.panel_split,
    workOrder.contracted_panel_id,
    workOrder.advertiser_campaign,
    workOrder.existing_advertiser,
    workOrder.panel_name,
    workOrder.train_line,
  ]);
}

export function siteSearchText(site: {
  area: string;
  site: string;
  panel_id: string;
  size?: string;
  area_progress?: string;
}): string {
  return joinSearchable([site.area, site.site, site.panel_id, site.size, site.area_progress]);
}
