import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usi-installer/ui/components/table";
import { Tabs, TabsList, TabsTrigger } from "@usi-installer/ui/components/tabs";

import { TablePagination } from "@/components/table-pagination";
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
  total: number;
  page: number;
  pageSize: number;
  status: WorkOrderStatusTab;
  search: string;
  onStatusChange: (status: WorkOrderStatusTab) => void;
  onSearchChange: (search: string) => void;
  onPageChange: (page: number) => void;
}

const HEADINGS = [
  "Status",
  "Location",
  "Panel ID",
  "Advertiser",
  "Existing Advertiser",
  "Train Line",
];

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
  total,
  page,
  pageSize,
  status,
  search,
  onStatusChange,
  onSearchChange,
  onPageChange,
}: WorkOrderTableProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <TableToolbar
        title={title}
        search={search}
        placeholder="Search by location, panel ID, advertiser"
        onSearchChange={onSearchChange}
      />

      <Tabs
        value={status}
        onValueChange={(value) => onStatusChange(value as WorkOrderStatusTab)}
        className="gap-0"
      >
        <TabsList
          variant="line"
          className="h-auto gap-10 border-b border-gray-200 bg-gray-50/50 px-8 pt-4 pb-0"
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

      <Table>
        <TableHeader>
          <TableRow className="border-slate-200 bg-gray-50 hover:bg-gray-50">
            {HEADINGS.map((heading) => (
              <TableHead
                key={heading}
                className="px-6 py-5 text-[11px] font-bold tracking-[0.55px] text-slate-500 uppercase"
              >
                {heading}
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
                    ? "px-6 py-4 text-sm font-medium text-red-600"
                    : "px-6 py-4 text-sm text-slate-700"
                }
              >
                {row.site}
              </TableCell>
              <TableCell className="px-6 py-4 text-sm font-medium text-slate-700">
                {row.panel_split}
              </TableCell>
              <TableCell className="px-6 py-4 text-sm text-slate-700">
                {row.advertiser_campaign}
              </TableCell>
              <TableCell className="px-6 py-4 text-sm text-slate-500">
                {row.existing_advertiser ?? "—"}
              </TableCell>
              <TableCell className="px-6 py-4 text-sm text-slate-500">
                {formatTrainLine(row.train_line)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <TablePagination total={total} page={page} pageSize={pageSize} onPageChange={onPageChange} />
    </section>
  );
}
