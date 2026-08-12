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

export interface SiteTableRow {
  key: string;
  area: string;
  site: string;
  panel_id: string;
  quantity?: number;
  size?: string;
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

const HEADINGS = ["Location", "Details", "Panel ID", "Qty", "Material Size"];

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
              <TableCell colSpan={5} className="px-6 py-10 text-center text-sm text-slate-400">
                No sites match this search.
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => (
            <TableRow key={row.key} className="border-slate-100">
              <TableCell className="px-6 py-4 text-sm text-slate-700">{row.area}</TableCell>
              <TableCell className="max-w-72 truncate px-6 py-4 text-sm text-slate-700">
                {row.site}
              </TableCell>
              <TableCell className="px-6 py-4 text-sm font-medium text-slate-700">
                {row.panel_id}
                {row.missing_value && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200 ring-inset">
                    No Panel ID
                  </span>
                )}
              </TableCell>
              <TableCell className="px-6 py-4 text-sm text-slate-600">
                {row.quantity ?? "—"}
              </TableCell>
              <TableCell className="px-6 py-4 text-sm text-slate-500">{row.size ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <TablePagination {...pagination} />
    </section>
  );
}
