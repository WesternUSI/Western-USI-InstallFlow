import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  ALL_TIME,
  type Duration,
  DurationSelect,
  durationRange,
} from "@/components/duration-select";
import { DeleteWorkOrdersDialog } from "@/components/delete-work-orders-dialog";
import { PageHeader } from "@/components/page-header";
import { WorkOrderStats } from "@/components/work-order-stats";
import { WorkOrderSelectionBanner } from "@/components/work-order-selection-banner";
import { type WorkOrderTableRow, WorkOrderTable } from "@/components/work-order-table";
import { WorkOrderTableSkeleton } from "@/components/work-order-table-skeleton";
import { useCursorPagination } from "@/hooks/use-cursor-pagination";
import { useDebouncedValue, useStickyValue } from "@/hooks/use-debounced-value";
import { chunk } from "@/lib/chunk";
import type { WorkOrderStatusTab } from "@/lib/workOrderStatus";

export const Route = createFileRoute("/_auth/manage-orders")({
  component: ManageOrdersPage,
});

const PAGE_SIZE = 25;

/** Ids sent per delete call, matching the backend's own batch. */
const DELETE_CHUNK = 500;

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
  const filterKey = `${status}|${debouncedSearch}|${since ?? ""}|${until ?? ""}`;

  const { paginationOpts, page, hasPrevious, next, previous } = useCursorPagination(
    PAGE_SIZE,
    filterKey,
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
      completion_photo_url: row.completion_photo_url,
    })) ?? [];

  // Deleting is admin-only. The backend enforces it too — this only decides
  // whether office staff are shown a control they would be refused.
  const currentUser = useQuery(api.users.currentUser);
  const canDelete = currentUser?.role === "admin";

  const deleteWorkOrders = useMutation(api.workorders.deleteWorkOrders);

  // Whole rows, not just ids: a selection survives paging, and the confirm
  // dialog still has to count completed rows the table no longer shows.
  const [picked, setPicked] = useState<ReadonlyMap<string, WorkOrderTableRow>>(new Map());
  // Set by the header checkbox, where the ids never reach the browser and the
  // filter is re-evaluated server-side instead.
  const [allMatching, setAllMatching] = useState(false);
  // Rows un-ticked out of a whole-filter selection. Whole rows again, so the
  // dialog can subtract their completed count from the filter's.
  const [excluded, setExcluded] = useState<ReadonlyMap<string, WorkOrderTableRow>>(new Map());
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [deletedSoFar, setDeletedSoFar] = useState<number | null>(null);

  // Change the filter and the old selection no longer describes anything the
  // operator can see — keeping it invites deleting rows off-screen.
  useEffect(() => {
    setPicked(new Map());
    setAllMatching(false);
    setExcluded(new Map());
  }, [filterKey]);

  const countCompleted = (rowsToCount: Iterable<WorkOrderTableRow>) =>
    [...rowsToCount].filter((row) => row.status === "completed").length;

  const totalMatching = counts?.[status === "all" ? "all" : status] ?? 0;
  const selectedCount = allMatching ? totalMatching - excluded.size : picked.size;

  // Narrowing to a status other than Completed means the filter cannot contain
  // a completed row, so there is nothing to warn about.
  const completedInFilter =
    status === "all" || status === "completed" ? (counts?.completed ?? 0) : 0;

  const completedCount = allMatching
    ? completedInFilter - countCompleted(excluded.values())
    : countCompleted(picked.values());

  // What the table paints as ticked. Under a whole-filter selection every row
  // on the page counts as ticked unless it has been explicitly un-ticked.
  const selectedKeys = useMemo(
    () =>
      allMatching
        ? new Set(rows.filter((row) => !excluded.has(row.key)).map((row) => row.key))
        : new Set(picked.keys()),
    [allMatching, excluded, picked, rows],
  );

  function clearSelection() {
    setPicked(new Map());
    setAllMatching(false);
    setExcluded(new Map());
  }

  function toggleRow(key: string) {
    const row = rows.find((candidate) => candidate.key === key);

    // Under a whole-filter selection a tick removes a row from the selection
    // rather than adding one, so it is recorded as an exclusion. Dropping back
    // to an explicit list is not an option — the other pages' ids were never
    // sent to the browser.
    const update = (previous: ReadonlyMap<string, WorkOrderTableRow>) => {
      const next = new Map(previous);
      if (next.has(key)) next.delete(key);
      else if (row !== undefined) next.set(key, row);
      return next;
    };

    if (allMatching) setExcluded(update);
    else setPicked(update);
  }

  // The header box covers the filter, not the page. Ticking 25 rows at a time
  // is no use for clearing an import of a few thousand, and a box that stopped
  // at the page edge would quietly under-select.
  function toggleAll(checked: boolean) {
    setPicked(new Map());
    setExcluded(new Map());
    setAllMatching(checked);
  }

  async function handleDelete() {
    setDeletedSoFar(0);
    let done = 0;

    try {
      if (allMatching) {
        // The server deletes one batch per call and reports what is left.
        let remaining = 1;
        while (remaining > 0) {
          const result = await deleteWorkOrders({
            filter: {
              status: status === "all" ? undefined : status,
              search: debouncedSearch,
              since,
              until,
              exclude: [...excluded.keys()] as Id<"workorders">[],
            },
          });
          done += result.deleted;
          remaining = result.remaining;
          setDeletedSoFar(done);
          // A batch that deletes nothing while claiming rows remain would spin
          // forever; stop rather than hammer the deployment.
          if (result.deleted === 0) break;
        }
      } else {
        const ids = [...picked.keys()] as Id<"workorders">[];
        for (const batch of chunk(ids, DELETE_CHUNK)) {
          const result = await deleteWorkOrders({ ids: batch });
          done += result.deleted;
          setDeletedSoFar(done);
        }
      }

      toast.success(`Deleted ${done.toLocaleString()} work order${done === 1 ? "" : "s"}`);
      clearSelection();
      setIsConfirmOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete work orders");
    } finally {
      setDeletedSoFar(null);
    }
  }

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
            selection={
              canDelete
                ? {
                    selected: selectedKeys,
                    allSelected: allMatching,
                    onToggle: toggleRow,
                    onToggleAll: toggleAll,
                    banner:
                      selectedCount > 0 ? (
                        <WorkOrderSelectionBanner
                          selectedCount={selectedCount}
                          onClear={clearSelection}
                          onDelete={() => setIsConfirmOpen(true)}
                        />
                      ) : undefined,
                  }
                : undefined
            }
          />
        )}

        <DeleteWorkOrdersDialog
          open={isConfirmOpen}
          total={selectedCount}
          completed={completedCount}
          deletedSoFar={deletedSoFar}
          onOpenChange={setIsConfirmOpen}
          onConfirm={handleDelete}
        />

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
