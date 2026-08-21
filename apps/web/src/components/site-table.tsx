import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usi-installer/ui/components/table";

import type { SearchOption } from "@/components/search-input";
import { TablePagination, type TablePaginationProps } from "@/components/table-pagination";
import { TableToolbar } from "@/components/table-toolbar";
import { CellText } from "@/components/cell-text";

/** Every column read off the Go Site Database sheet. */
export interface SiteTableRow {
  key: string;
  area: string;
  site: string;
  panel_id: string;
  quantity?: number;
  size?: string;
  area_progress?: string;
  equipment_needed?: string[];
  install_notes?: string;
  location?: string;
  missing_value: boolean;
}

interface SiteTableProps {
  title: string;
  rows: SiteTableRow[];
  search: string;
  searchOptions: SearchOption[] | undefined;
  pagination: TablePaginationProps;
  onSearchChange: (search: string) => void;
}

/**
 * Mirrors the Go Site Database's own column order. Widths sum to 100% under
 * `table-fixed`; the table's min-width scrolls sideways rather than crushing
 * a column.
 */
const COLUMNS = [
  { label: "Location", width: "w-[11%]", padding: "px-6" },
  { label: "Details", width: "w-[16%]", padding: "px-4" },
  { label: "Panel ID", width: "w-[10%]", padding: "px-4" },
  { label: "Qty", width: "w-[5%]", padding: "px-4" },
  { label: "Size", width: "w-[9%]", padding: "px-4" },
  { label: "Area", width: "w-[10%]", padding: "px-4" },
  { label: "Equipment", width: "w-[13%]", padding: "px-4" },
  { label: "Install Notes", width: "w-[15%]", padding: "px-4" },
  { label: "GPS Co-ordinates", width: "w-[11%]", padding: "px-4" },
] as const;

export function SiteTable({
  title,
  rows,
  search,
  searchOptions,
  pagination,
  onSearchChange,
}: SiteTableProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <TableToolbar
        title={title}
        search={search}
        searchOptions={searchOptions}
        placeholder="Search by location, panel ID, details"
        onSearchChange={onSearchChange}
      />

      <Table className="min-w-[1500px] table-fixed">
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
              <TableCell
                colSpan={COLUMNS.length}
                className="px-6 py-10 text-center text-sm text-slate-400"
              >
                No sites match this search.
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => (
            <TableRow key={row.key} className="border-slate-100">
              <TableCell className="px-6 py-4 text-sm text-slate-700">
                <CellText value={row.area} />
              </TableCell>
              <TableCell className="px-4 py-4 text-sm text-slate-700">
                <CellText value={row.site} />
              </TableCell>
              <TableCell className="px-4 py-4 text-sm font-medium break-words whitespace-normal text-slate-700">
                {row.panel_id}
                {row.missing_value && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200 ring-inset">
                    No Panel ID
                  </span>
                )}
              </TableCell>
              <TableCell className="px-4 py-4 text-sm text-slate-600">
                <CellText value={row.quantity} />
              </TableCell>
              <TableCell className="px-4 py-4 text-sm text-slate-500">
                <CellText value={row.size} />
              </TableCell>
              <TableCell className="px-4 py-4 text-sm text-slate-500">
                <CellText value={row.area_progress} />
              </TableCell>
              <TableCell className="px-4 py-4 text-sm text-slate-500">
                <CellText value={row.equipment_needed?.join(", ")} />
              </TableCell>
              <TableCell className="px-4 py-4 text-sm text-slate-500">
                <CellText value={row.install_notes} />
              </TableCell>
              <TableCell className="px-4 py-4 text-sm text-slate-500">
                <CellText value={row.location} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <TablePagination {...pagination} />
    </section>
  );
}
