import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usi-installer/ui/components/table";
import { Tabs, TabsList, TabsTrigger } from "@usi-installer/ui/components/tabs";
import type { ReactNode } from "react";

import type { SearchOption } from "@/components/search-input";
import { TablePagination, type TablePaginationProps } from "@/components/table-pagination";
import { TableToolbar } from "@/components/table-toolbar";
import {
  type WorkOrderStatus,
  type WorkOrderStatusTab,
  WORK_ORDER_STATUS_CLASSES,
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_STATUS_TABS,
  formatTrainLine,
} from "@/lib/workOrderStatus";

export interface WorkOrderTableRow {
  key: string;
  status: WorkOrderStatus;
  site: string;
  panel_split: string;
  advertiser_campaign: string;
  existing_advertiser?: string;
  train_line?: string;
}

export interface WorkOrderCounts {
  all: number;
  completed: number;
  allocated: number;
  not_allocated: number;
  missing_site: number;
}

interface WorkOrderTableProps {
  title: string;
  rows: WorkOrderTableRow[];
  counts: WorkOrderCounts;
  status: WorkOrderStatusTab;
  search: string;
  searchOptions: SearchOption[] | undefined;
  /** Control beside the search box — the Duration filter on Manage Orders. */
  action?: ReactNode;
  pagination: TablePaginationProps;
  onStatusChange: (status: WorkOrderStatusTab) => void;
  onSearchChange: (search: string) => void;
}

/** Widths add up to 100% so the table never overflows its card. */
const COLUMNS = [
  { label: "Status", width: "w-[13%]", padding: "px-6" },
  { label: "Location", width: "w-[22%]", padding: "px-4" },
  { label: "Panel ID", width: "w-[12%]", padding: "px-4" },
  { label: "Advertiser", width: "w-[19%]", padding: "px-4" },
  { label: "Existing Advertiser", width: "w-[19%]", padding: "px-4" },
  { label: "Train Line", width: "w-[15%]", padding: "px-4" },
] as const;

function StatusPill({ status }: { status: WorkOrderStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${WORK_ORDER_STATUS_CLASSES[status]}`}
    >
      {WORK_ORDER_STATUS_LABELS[status]}
    </span>
  );
}

export function WorkOrderTable({
  title,
  rows,
  counts,
  status,
  search,
  searchOptions,
  action,
  pagination,
  onStatusChange,
  onSearchChange,
}: WorkOrderTableProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <TableToolbar
        title={title}
        search={search}
        searchOptions={searchOptions}
        action={action}
        placeholder="Search by location, panel ID, advertiser"
        onSearchChange={onSearchChange}
      />

      <Tabs
        value={status}
        onValueChange={(value) => onStatusChange(value as WorkOrderStatusTab)}
        className="gap-0 overflow-x-auto overflow-y-hidden"
      >
        <TabsList
          variant="line"
          className="h-auto w-full gap-10 border-b border-gray-200 bg-gray-50/50 px-6 pt-4 pb-0"
        >
          {WORK_ORDER_STATUS_TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="px-1 pb-4 text-sm font-medium data-active:text-blue-600 data-active:after:bg-blue-500"
            >
              {tab.label} ({counts[tab.value].toLocaleString()})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Fixed layout with explicit widths so long values truncate instead
          of stretching a column; min-width keeps columns readable on
          narrow screens, scrolling sideways instead. */}
      <Table className="min-w-[880px] table-fixed">
        <TableHeader>
          <TableRow className="border-slate-200 bg-gray-50 hover:bg-gray-50">
            {COLUMNS.map((column) => (
              <TableHead
                key={column.label}
                className={`${column.width} ${column.padding} py-5 text-[11px] font-bold tracking-[0.55px] text-slate-500 uppercase`}
              >
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400">
                No work orders match this filter.
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => (
            <TableRow key={row.key} className="border-slate-100">
              <TableCell className="px-6 py-4">
                <StatusPill status={row.status} />
              </TableCell>
              {/* An unmatched location is the thing to act on, so it is called
                  out in the row as well as in the status pill. */}
              <TableCell
                className={
                  row.status === "missing_site"
                    ? "truncate px-4 py-4 text-sm font-medium text-red-600"
                    : "truncate px-4 py-4 text-sm text-slate-700"
                }
              >
                {row.site}
              </TableCell>
              <TableCell className="truncate px-4 py-4 text-sm font-medium text-slate-700">
                {row.panel_split}
              </TableCell>
              <TableCell className="truncate px-4 py-4 text-sm text-slate-700">
                {row.advertiser_campaign}
              </TableCell>
              <TableCell className="truncate px-4 py-4 text-sm text-slate-500">
                {row.existing_advertiser ?? "—"}
              </TableCell>
              <TableCell className="truncate px-4 py-4 text-sm text-slate-500">
                {formatTrainLine(row.train_line)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <TablePagination {...pagination} />
    </section>
  );
}
