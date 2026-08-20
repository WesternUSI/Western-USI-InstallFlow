import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Info } from "lucide-react";
import { useState } from "react";

import {
  ALL_TIME,
  type Duration,
  DurationSelect,
  durationRange,
} from "@/components/duration-select";
import { PageHeader } from "@/components/page-header";
import { WorkOrderStats } from "@/components/work-order-stats";
import { type WorkOrderTableRow, WorkOrderTable } from "@/components/work-order-table";
import { WorkOrderTableSkeleton } from "@/components/work-order-table-skeleton";
import { useCursorPagination } from "@/hooks/use-cursor-pagination";
import { useDebouncedValue, useStickyValue } from "@/hooks/use-debounced-value";
import type { WorkOrderStatusTab } from "@/lib/workOrderStatus";

export const Route = createFileRoute("/_auth/manage-orders")({
  component: ManageOrdersPage,
});

const PAGE_SIZE = 25;

const EMPTY_COUNTS = {
  all: 0,
  completed: 0,
  allocated: 0,
  not_allocated: 0,
  missing_site: 0,
};

function ManageOrdersPage() {
  const [status, setStatus] = useState<WorkOrderStatusTab>("all");
  const [search, setSearch] = useState("");
  const [duration, setDuration] = useState<Duration>(ALL_TIME);

  // The box updates instantly; the queries follow once typing pauses, so a
  // word typed out is one round trip rather than one per letter.
  const debouncedSearch = useDebouncedValue(search);
  const { since, until } = durationRange(duration);

  // Keyed on the debounced term, not the raw one, so the cursor is dropped at
  // the same moment the query arguments actually change.
  const { paginationOpts, page, hasPrevious, next, previous } = useCursorPagination(
    PAGE_SIZE,
    `${status}|${debouncedSearch}|${since ?? ""}|${until ?? ""}`,
  );

  // Rows come back one cursor page at a time; totals need their own pass over
  // the table, so the tab counts and the row counter are a separate query.
  // `useStickyValue` keeps the current page on screen while the next one loads
  // instead of dropping back to the skeleton on every change.
  const result = useStickyValue(
    useQuery(api.workorders.list, {
      paginationOpts,
      status: status === "all" ? undefined : status,
      search: debouncedSearch,
      since,
      until,
    }),
  );
  const counts = useStickyValue(
    useQuery(api.workorders.counts, { search: debouncedSearch, since, until }),
  );

  // No arguments, so Convex computes this once per data change and shares it —
  // filtering as the user types happens in the browser.
  const searchOptions = useQuery(api.workorders.searchOptions);

  const rows: WorkOrderTableRow[] =
    result?.page.map((row) => ({
      key: row._id,
      status: row.status,
      contract_id: row.contract_id,
      advertiser_campaign: row.advertiser_campaign,
      contracted_panel_id: row.contracted_panel_id,
      panel_split: row.panel_split,
      site: row.site,
      panel_name: row.panel_name,
      quantity: row.quantity,
      format: row.format,
      size: row.size,
      proposed_install_date: row.proposed_install_date,
      end_date: row.end_date,
      comments: row.comments,
      existing_advertiser: row.existing_advertiser,
      area_progress: row.area_progress,
      schedule: row.schedule,
      train_line: row.train_line,
    })) ?? [];

  return (
    <>
      <PageHeader
        title="Manage Orders"
        description="Browse, filter, and manage all imported work orders."
      />
      <div className="flex flex-col gap-4 px-4 py-6">
        <WorkOrderStats />

        {result === undefined ? (
          <WorkOrderTableSkeleton />
        ) : (
          <WorkOrderTable
            title="Order Details"
            rows={rows}
            counts={counts ?? EMPTY_COUNTS}
            status={status}
            search={search}
            searchOptions={searchOptions}
            action={<DurationSelect value={duration} onChange={setDuration} />}
            pagination={{
              shown: rows.length,
              total: counts?.[status === "all" ? "all" : status] ?? 0,
              page,
              pageSize: PAGE_SIZE,
              hasPrevious,
              hasNext: !result.isDone,
              onPrevious: previous,
              onNext: () => next(result.continueCursor),
            }}
            onStatusChange={setStatus}
            onSearchChange={setSearch}
          />
        )}

        <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-6 py-4">
          <Info className="mt-0.5 size-5 shrink-0 text-blue-500" />
          <p className="text-sm leading-relaxed text-blue-900">
            <span className="font-medium">Tip:</span> Use filters to quickly find specific work
            orders or export the list for external review.
          </p>
        </div>
      </div>
    </>
  );
}
