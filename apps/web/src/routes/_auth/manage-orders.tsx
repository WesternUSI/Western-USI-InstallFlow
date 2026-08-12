import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Info } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { WorkOrderStats } from "@/components/work-order-stats";
import { type WorkOrderTableRow, WorkOrderTable } from "@/components/work-order-table";
import { WorkOrderTableSkeleton } from "@/components/work-order-table-skeleton";
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
  const [page, setPage] = useState(1);

  // Filtering and paging happen server-side so the browser never holds the
  // whole table — imports keep accumulating as history.
  const result = useQuery(api.workorders.list, {
    status: status === "all" ? undefined : status,
    search,
    page,
    page_size: PAGE_SIZE,
  });

  const rows: WorkOrderTableRow[] =
    result?.rows.map((row) => ({
      key: row._id,
      status: row.status,
      site: row.site,
      panel_split: row.panel_split,
      advertiser_campaign: row.advertiser_campaign,
      existing_advertiser: row.existing_advertiser,
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
            counts={result.counts ?? EMPTY_COUNTS}
            total={result.total}
            page={page}
            pageSize={PAGE_SIZE}
            status={status}
            search={search}
            onStatusChange={(next) => {
              setStatus(next);
              setPage(1);
            }}
            onSearchChange={(next) => {
              setSearch(next);
              setPage(1);
            }}
            onPageChange={setPage}
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
