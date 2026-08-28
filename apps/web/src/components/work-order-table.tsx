import { Checkbox } from "@usi-installer/ui/components/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usi-installer/ui/components/table";
import { Tabs, TabsList, TabsTrigger } from "@usi-installer/ui/components/tabs";
import { ImageIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import { CompletionPhotoDialog } from "@/components/completion-photo-dialog";
import type { SearchOption } from "@/components/search-input";
import { TableScrollArea } from "@/components/table-scroll-area";
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
  /** The photo an installer submitted in Complete Installs — same one the completion email carries. */
  completion_photo_url?: string;
}

export interface WorkOrderCounts {
  all: number;
  completed: number;
  allocated: number;
  not_allocated: number;
  missing_site: number;
}

/**
 * Row selection, supplied only by Manage Orders.
 *
 * Opt-in because this table is also the import preview and the team detail
 * tabs, where there is nothing to select and nothing to delete. Leaving the
 * prop off renders exactly the table those two have always rendered.
 */
export interface WorkOrderSelection {
  /** Keys of the ticked rows on the page currently shown. */
  selected: ReadonlySet<string>;
  /** True when the whole filter is selected, not merely this page. */
  allSelected: boolean;
  onToggle: (key: string) => void;
  /** Selects or clears every row the filter matches, across all pages. */
  onToggleAll: (checked: boolean) => void;
  /** Bar shown between the tabs and the rows while anything is ticked. */
  banner?: ReactNode;
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
  selection?: WorkOrderSelection;
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
  // Labelled Area for the operators, though the field behind it is still
  // `train_line` — a display rename only, nothing on the backend moved.
  { label: "Area", width: "w-[5%]", padding: "px-4" },
  // Not part of the Installation Schedule sheet — appended after it rather
  // than mixed into the mirrored column order above.
  { label: "Photo", width: "w-[110px]", padding: "px-4" },
] as const;

/** Enough room for all seventeen sheet columns plus Photo before they start to crush. */
export const WORK_ORDER_TABLE_MIN_WIDTH = "min-w-[2310px]";

/** The same, plus the 44px selection column Manage Orders adds. */
const WORK_ORDER_TABLE_SELECTABLE_MIN_WIDTH = "min-w-[2354px]";

/** Blue to match the row-selected state, sized down from the login checkbox. */
const CHECKBOX_CLASS =
  "size-4 rounded-[4px] border-[1.5px] border-slate-300 data-checked:border-blue-600 data-checked:bg-blue-600";

/**
 * Centres the 16px box against the first line of the row beside it.
 *
 * Cells are top-aligned so that wrapped text grows downwards, which leaves a
 * bare checkbox sitting a few pixels high of the status pill next to it. These
 * match the pill's height and the header label's line box respectively, so the
 * column reads as one straight line at any row height.
 */
const CHECKBOX_CELL_ALIGN = "flex h-[22px] items-center";
const CHECKBOX_HEAD_ALIGN = "flex h-[17px] items-center";

export function WorkOrderTableHead({ selection }: { selection?: WorkOrderSelection }) {
  return (
    <TableHeader>
      <TableRow className="border-slate-200 bg-gray-50 hover:bg-gray-50">
        {selection !== undefined && (
          <TableHead className="w-[44px] px-4 py-5 align-top">
            <div className={CHECKBOX_HEAD_ALIGN}>
              <Checkbox
                aria-label="Select every row matching this filter"
                checked={selection.allSelected}
                onCheckedChange={(checked) => selection.onToggleAll(checked === true)}
                className={CHECKBOX_CLASS}
              />
            </div>
          </TableHead>
        )}
        {WORK_ORDER_COLUMNS.map((column) => (
          <TableHead
            key={column.label}
            className={`${column.width} ${column.padding} py-5 text-[11px] font-bold tracking-[0.55px] whitespace-normal text-slate-500 uppercase`}
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
      <CompletionPhotoCell row={row} />
    </>
  );
}

/**
 * The Photo column: a button per row, opening the shot at a size worth looking
 * at rather than the 40px thumbnail the column can afford.
 *
 * Rendered for every row, greyed and disabled where there is no photo, rather
 * than swapped for an em dash — an order is only photographed once it is
 * completed, so the disabled state is the common one and reads as "nothing to
 * see yet" instead of leaving a blank the operator has to interpret.
 */
function CompletionPhotoCell({ row }: { row: WorkOrderTableRow }) {
  const [isOpen, setIsOpen] = useState(false);
  const url = row.completion_photo_url;

  return (
    <TableCell className="px-4 py-4 align-top">
      <button
        type="button"
        disabled={url === undefined}
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 disabled:hover:border-slate-200 disabled:hover:bg-slate-50"
      >
        <ImageIcon className="size-4" />
        View
      </button>

      {url !== undefined && (
        <CompletionPhotoDialog
          open={isOpen}
          url={url}
          panelSplit={row.panel_split}
          site={row.site}
          onOpenChange={setIsOpen}
        />
      )}
    </TableCell>
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
  selection,
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

      {selection?.banner}

      {/* Fixed layout with explicit widths so one long value cannot stretch a
          column — it wraps and grows the row instead. Min-width keeps every
          column readable, scrolling sideways rather than crushing them.
          `TableScrollArea` owns the scrolling, so the table's own container is
          told not to, or the two would nest. */}
      <TableScrollArea>
        <Table
          containerClassName="overflow-visible"
          className={`${
            selection === undefined
              ? WORK_ORDER_TABLE_MIN_WIDTH
              : WORK_ORDER_TABLE_SELECTABLE_MIN_WIDTH
          } table-fixed`}
        >
          <WorkOrderTableHead selection={selection} />
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={WORK_ORDER_COLUMNS.length + (selection === undefined ? 0 : 1)}
                  className="px-6 py-10 text-center text-sm text-slate-400"
                >
                  No work orders match this filter.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow
                key={row.key}
                className={`border-slate-100 ${
                  selection?.selected.has(row.key) === true ? "bg-blue-50/60" : ""
                }`}
              >
                {/* Outside `WorkOrderRowCells` on purpose: that component is
                    shared with the import preview and the team tabs, which have
                    no selection and must keep their column count. */}
                {selection !== undefined && (
                  <TableCell className="px-4 py-4 align-top">
                    <div className={CHECKBOX_CELL_ALIGN}>
                      <Checkbox
                        aria-label={`Select ${row.panel_split}`}
                        checked={selection.selected.has(row.key)}
                        onCheckedChange={() => selection.onToggle(row.key)}
                        className={CHECKBOX_CLASS}
                      />
                    </div>
                  </TableCell>
                )}
                <WorkOrderRowCells row={row} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableScrollArea>

      <TablePagination {...pagination} />
    </section>
  );
}
