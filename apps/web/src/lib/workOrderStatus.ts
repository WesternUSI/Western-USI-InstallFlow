/** Mirrors the derived status returned by `api.workorders.list`. */
export type WorkOrderStatus =
  | "completed"
  | "missing_site"
  | "pending"
  | "allocated"
  | "not_allocated";

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  completed: "Completed",
  missing_site: "Missing Site",
  pending: "Pending",
  allocated: "Allocated",
  not_allocated: "Not Allocated",
};

/** Pill colours, matching the status chips in the design. */
export const WORK_ORDER_STATUS_CLASSES: Record<WorkOrderStatus, string> = {
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  missing_site: "bg-red-50 text-red-700 ring-red-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  allocated: "bg-blue-50 text-blue-700 ring-blue-200",
  not_allocated: "bg-slate-100 text-slate-600 ring-slate-200",
};

/** Tab order across the top of the work order table. */
export const WORK_ORDER_STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "allocated", label: "Allocated" },
  { value: "not_allocated", label: "Not Allocated" },
  { value: "completed", label: "Completed" },
  { value: "missing_site", label: "Missing Sites" },
] as const;

export type WorkOrderStatusTab = (typeof WORK_ORDER_STATUS_TABS)[number]["value"];

/** "Yanchep" -> "Yanchep Line". Unmatched rows have no site to name. */
export function formatTrainLine(trainLine: string | undefined): string {
  if (trainLine === undefined || trainLine.trim() === "") return "—";
  return trainLine.endsWith("Line") ? trainLine : `${trainLine} Line`;
}
