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
import { CellText } from "@/components/cell-text";
import {
  type WorkOrderStatus,
  type WorkOrderStatusTab,
  WORK_ORDER_STATUS_CLASSES,
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_STATUS_TABS,
  formatTrainLine,
} from "@/lib/workOrderStatus";

/** Every column read off the Installation Schedule, plus the derived status. */
export interface WorkOrderTableRow {
  key: string;
  status: WorkOrderStatus;
  contract_id?: string;
  advertiser_campaign: string;
  contracted_panel_id?: string;
  panel_split: string;
  site: string;
  panel_name?: string;
  quantity?: number;
  format?: string;
  size?: string;
  proposed_install_date?: string;
  end_date?: string;
  comments?: string;
  existing_advertiser?: string;
  area_progress?: string;
  schedule?: string;
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

/**
 * Mirrors the Installation Schedule's own column order so the table reads like
 * the sheet it came from. Widths sum to 100% under `table-fixed`, and the
 * table's `min-w` keeps every column legible — it scrolls sideways instead of
 * crushing them.
 */
export const WORK_ORDER_COLUMNS = [
  { label: "Status", width: "w-[6%]", padding: "px-6" },
  { label: "Contract", width: "w-[6%]", padding: "px-4" },
  { label: "Advertiser / Campaign", width: "w-[7%]", padding: "px-4" },
  { label: "Contracted Panel ID", width: "w-[6%]", padding: "px-4" },
  { label: "Panel Split", width: "w-[5%]", padding: "px-4" },
  { label: "Location", width: "w-[8%]", padding: "px-4" },
  { label: "Panel Name", width: "w-[7%]", padding: "px-4" },
  { label: "Qty", width: "w-[3%]", padding: "px-4" },
  { label: "Format", width: "w-[4%]", padding: "px-4" },
  { label: "Size (W x H)", width: "w-[5%]", padding: "px-4" },
  { label: "Proposed Install Date", width: "w-[7%]", padding: "px-4" },
  { label: "End Date", width: "w-[6%]", padding: "px-4" },
  { label: "Comments", width: "w-[7%]", padding: "px-4" },
  { label: "Existing Advertiser", width: "w-[8%]", padding: "px-4" },
  { label: "Line", width: "w-[5%]", padding: "px-4" },
  { label: "Schedule", width: "w-[5%]", padding: "px-4" },
  { label: "Train Line", width: "w-[5%]", padding: "px-4" },
] as const;

/** Enough room for all seventeen columns before they start to crush. */
export const WORK_ORDER_TABLE_MIN_WIDTH = "min-w-[2200px]";

export function WorkOrderTableHead() {
  return (
    <TableHeader>
      <TableRow className="border-slate-200 bg-gray-50 hover:bg-gray-50">
        {WORK_ORDER_COLUMNS.map((column) => (
          <TableHead
            key={column.label}
            className={`${column.width} ${column.padding} py-5 text-[11px] font-bold tracking-[0.55px] text-slate-500 uppercase`}
          >
            {column.label}
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
  );
}

function StatusPill({ status }: { status: WorkOrderStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${WORK_ORDER_STATUS_CLASSES[status]}`}
    >
      {WORK_ORDER_STATUS_LABELS[status]}
    </span>
  );
}

/** The cells for one work order, shared by Manage Orders, the import preview
 * and the team detail tabs so all three stay in step. */
export function WorkOrderRowCells({ row }: { row: WorkOrderTableRow }) {
  return (
    <>
      <TableCell className="px-6 py-4">
        <StatusPill status={row.status} />
      </TableCell>
      <TableCell className="px-4 py-4 text-sm text-slate-700">
        <CellText value={row.contract_id} />
      </TableCell>
      <TableCell className="px-4 py-4 text-sm text-slate-700">
        <CellText value={row.advertiser_campaign} />
      </TableCell>
      <TableCell className="px-4 py-4 text-sm text-slate-500">
        <CellText value={row.contracted_panel_id} />
      </TableCell>
      <TableCell className="px-4 py-4 text-sm font-medium text-slate-700">
        <CellText value={row.panel_split} />
      </TableCell>
      {/* An unmatched location is the thing to act on, so it is called out in
          the row as well as in the status pill. */}
      <TableCell
        className={
          row.status === "missing_site"
            ? "px-4 py-4 text-sm font-medium text-red-600"
            : "px-4 py-4 text-sm text-slate-700"
        }
      >
        <CellText value={row.site} />
      </TableCell>
      <TableCell className="px-4 py-4 text-sm text-slate-500">
        <CellText value={row.panel_name} />
      </TableCell>
      <TableCell className="px-4 py-4 text-sm text-slate-500">
        <CellText value={row.quantity} />
      </TableCell>
      <TableCell className="px-4 py-4 text-sm text-slate-500">
        <CellText value={row.format} />
      </TableCell>
      <TableCell className="px-4 py-4 text-sm text-slate-500">
        <CellText value={row.size} />
      </TableCell>
      <TableCell className="px-4 py-4 text-sm text-slate-500">
        <CellText value={row.proposed_install_date} />
      </TableCell>
      <TableCell className="px-4 py-4 text-sm text-slate-500">
        <CellText value={row.end_date} />
      </TableCell>
      <TableCell className="px-4 py-4 text-sm text-slate-500">
        <CellText value={row.comments} />
      </TableCell>
      <TableCell className="px-4 py-4 text-sm text-slate-500">
        <CellText value={row.existing_advertiser} />
      </TableCell>
      <TableCell className="px-4 py-4 text-sm text-slate-500">
        <CellText value={row.area_progress} />
      </TableCell>
      <TableCell className="px-4 py-4 text-sm text-slate-500">
        <CellText value={row.schedule} />
      </TableCell>
      <TableCell className="px-4 py-4 text-sm text-slate-500">
        {/* Already falls back to an em dash of its own. */}
        <CellText value={formatTrainLine(row.train_line)} />
      </TableCell>
    </>
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

      {/* Fixed layout with explicit widths so one long value cannot stretch a
          column — it wraps and grows the row instead. Min-width keeps every
          column readable, scrolling sideways rather than crushing them. */}
      <Table className={`${WORK_ORDER_TABLE_MIN_WIDTH} table-fixed`}>
        <WorkOrderTableHead />
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={WORK_ORDER_COLUMNS.length}
                className="px-6 py-10 text-center text-sm text-slate-400"
              >
                No work orders match this filter.
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => (
            <TableRow key={row.key} className="border-slate-100">
              <WorkOrderRowCells row={row} />
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <TablePagination {...pagination} />
    </section>
  );
}
