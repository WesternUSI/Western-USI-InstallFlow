import { api } from "@usi-installer/backend/convex/_generated/api";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Badge } from "@usi-installer/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usi-installer/ui/components/table";
import { useQuery } from "convex/react";
import { CalendarClock } from "lucide-react";

import { ExcelIcon } from "@/components/excel-icon";
import { formatReleaseDate } from "@/components/import-schedule-card";
import { PageHeader } from "@/components/page-header";
import { ScheduledImportActions } from "@/components/scheduled-import-actions";
import { TableScrollArea } from "@/components/table-scroll-area";

export const Route = createFileRoute("/_auth/scheduled-imports")({
  component: ScheduledImportsPage,
});

/** Widths add up to 100% so the table never overflows its card. */
const COLUMNS = [
  { label: "File", width: "w-[24%]", padding: "px-6" },
  { label: "Scheduled By", width: "w-[15%]", padding: "px-4" },
  { label: "Work Orders", width: "w-[11%]", padding: "px-4" },
  { label: "Release Date", width: "w-[18%]", padding: "px-4" },
  { label: "Status", width: "w-[10%]", padding: "px-4" },
  { label: "Actions", width: "w-[22%]", padding: "px-4" },
] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** "Tomorrow", "In 6 days" — the useful part of a release date at a glance. */
function countdown(releaseAt: number): string {
  const days = Math.ceil((releaseAt - Date.now()) / MS_PER_DAY);
  if (days <= 0) return "Due now";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

function ScheduledImportsPage() {
  const batches = useQuery(api.scheduledImports.listScheduled);

  return (
    <>
      <PageHeader
        title="Scheduled Imports"
        description="Work order batches waiting to go live on a future date."
      />

      <div className="flex flex-col gap-4 px-4 py-6">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
            <div>
              <p className="text-base font-bold text-gray-900">Pending Batches</p>
              <p className="mt-0.5 text-sm text-gray-500">
                These work orders are not visible to installers, and do not appear on Manage Orders,
                until their release date.
              </p>
            </div>
            <Link
              to="/import-work-orders"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Import Work Orders
            </Link>
          </div>

          {batches === undefined ? (
            <p className="px-6 py-12 text-center text-sm text-slate-400">Loading…</p>
          ) : batches.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <CalendarClock className="size-6" />
              </div>
              <p className="text-sm font-medium text-slate-700">Nothing scheduled</p>
              <p className="max-w-md text-sm text-slate-500">
                Upload an Installation Schedule and pick "Schedule for later" to hold a batch back
                until a chosen date.
              </p>
            </div>
          ) : (
            <TableScrollArea>
              <Table className="min-w-[1000px] table-fixed">
                <TableHeader>
                  <TableRow className="border-slate-200 bg-white hover:bg-white">
                    {COLUMNS.map((column) => (
                      <TableHead
                        key={column.label}
                        className={`${column.width} ${column.padding} py-3 text-[11px] font-bold tracking-[0.55px] text-slate-500 uppercase`}
                      >
                        {column.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => (
                    <TableRow key={batch._id} className="border-slate-100">
                      <TableCell className="px-6 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <ExcelIcon className="size-8 shrink-0" />
                          <span className="truncate text-sm font-medium text-slate-800">
                            {batch.file_name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="truncate px-4 py-3 text-sm text-slate-500">
                        {batch.uploaded_by_name}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-slate-700">
                        {batch.total_rows.toLocaleString()}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <p className="text-sm text-slate-700">
                          {formatReleaseDate(batch.release_date)}
                        </p>
                        <p className="text-xs text-slate-400">{countdown(batch.release_at)}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        {batch.status === "pending" ? (
                          <Badge className="rounded-full bg-blue-50 px-2.5 text-xs font-medium text-blue-700">
                            Scheduled
                          </Badge>
                        ) : (
                          <Badge className="rounded-full bg-amber-50 px-2.5 text-xs font-medium text-amber-700">
                            Releasing
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <ScheduledImportActions batch={batch} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableScrollArea>
          )}
        </section>
      </div>
    </>
  );
}
