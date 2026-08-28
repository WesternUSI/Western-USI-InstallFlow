import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@usi-installer/ui/components/button";
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
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AddSiteDialog } from "@/components/add-site-dialog";
import { CellText } from "@/components/cell-text";
import { DeleteSitesDialog } from "@/components/delete-sites-dialog";
import {
  ALL_TIME,
  type Duration,
  DurationSelect,
  durationRangeMs,
} from "@/components/duration-select";
import { FilterSelect } from "@/components/filter-select";
import { ImportSummaryCard } from "@/components/import-summary-card";
import { PageHeader } from "@/components/page-header";
import { type SearchOption, SearchInput } from "@/components/search-input";
import { SiteStats } from "@/components/site-stats";
import { TablePagination } from "@/components/table-pagination";
import { TableScrollArea } from "@/components/table-scroll-area";
import { WorkOrderSelectionBanner } from "@/components/work-order-selection-banner";
import { useCursorPagination } from "@/hooks/use-cursor-pagination";
import { useDebouncedValue, useStickyValue } from "@/hooks/use-debounced-value";
import { chunk } from "@/lib/chunk";
import {
  type SiteDetailStatusTab,
  SITE_DETAIL_STATUS_CLASSES,
  SITE_DETAIL_STATUS_LABELS,
  SITE_DETAIL_STATUS_TABS,
} from "@/lib/siteDetailStatus";

export const Route = createFileRoute("/_auth/manage-site-data")({
  component: ManageSiteDataPage,
});

const PAGE_SIZE = 25;

/** Ids sent per delete call, matching the backend batch. */
const DELETE_CHUNK = 50;

/** Blue to match the row-selected state, same as the work-order table. */
const CHECKBOX_CLASS =
  "size-4 rounded-[4px] border-[1.5px] border-slate-300 data-checked:border-blue-600 data-checked:bg-blue-600";
const ALL_LOCATIONS = "__all__";

/**
 * Mirrors the Go Site Database's own column order, with the derived status and
 * the row action on the end. Widths sum to 100% under `table-fixed`.
 */
const COLUMNS = [
  { label: "Location", width: "w-[10%]", padding: "px-6" },
  { label: "Details", width: "w-[13%]", padding: "px-4" },
  { label: "Panel ID", width: "w-[8%]", padding: "px-4" },
  { label: "Qty", width: "w-[4%]", padding: "px-4" },
  { label: "Size", width: "w-[7%]", padding: "px-4" },
  { label: "Area", width: "w-[8%]", padding: "px-4" },
  { label: "Equipment", width: "w-[11%]", padding: "px-4" },
  { label: "Install Notes", width: "w-[12%]", padding: "px-4" },
  { label: "GPS Co-ordinates", width: "w-[9%]", padding: "px-4" },
  { label: "Details Status", width: "w-[10%]", padding: "px-4" },
  { label: "Actions", width: "w-[8%]", padding: "px-4" },
] as const;

function FilterBar({
  search,
  searchOptions,
  area,
  areas,
  status,
  duration,
  onSearchChange,
  onAreaChange,
  onStatusChange,
  onDurationChange,
  onAddSite,
}: {
  search: string;
  searchOptions: SearchOption[] | undefined;
  area: string;
  areas: string[] | undefined;
  status: SiteDetailStatusTab;
  duration: Duration;
  onSearchChange: (value: string) => void;
  onAreaChange: (value: string) => void;
  onStatusChange: (value: SiteDetailStatusTab) => void;
  onDurationChange: (value: Duration) => void;
  onAddSite: () => void;
}) {
  return (
    // px-6 lines the controls up with the tabs and the table columns below.
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-6 py-4">
      <SearchInput
        value={search}
        options={searchOptions}
        placeholder="Search by location, panel ID, details"
        onChange={onSearchChange}
        className="min-w-56 flex-1"
      />

      <FilterSelect
        label="Location"
        value={area}
        options={[
          { value: ALL_LOCATIONS, label: "All" },
          ...(areas ?? []).map((option) => ({ value: option, label: option })),
        ]}
        onChange={onAreaChange}
      />

      <FilterSelect
        label="Details Status"
        value={status}
        options={SITE_DETAIL_STATUS_TABS.map((tab) => ({
          value: tab.value,
          label: tab.value === "all" ? "All" : tab.label,
        }))}
        onChange={(next) => onStatusChange(next as SiteDetailStatusTab)}
      />

      <DurationSelect value={duration} onChange={onDurationChange} />

      <Button className="h-[38px] shrink-0 gap-1.5 rounded-lg" onClick={onAddSite}>
        <Plus className="size-4" />
        Add Site
      </Button>
    </div>
  );
}

function ManageSiteDataPage() {
  const [status, setStatus] = useState<SiteDetailStatusTab>("all");
  const [area, setArea] = useState(ALL_LOCATIONS);
  const [search, setSearch] = useState("");
  const [duration, setDuration] = useState<Duration>(ALL_TIME);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // The box updates instantly; the queries follow once typing pauses, so a
  // word typed out is one round trip rather than one per letter.
  const debouncedSearch = useDebouncedValue(search);
  const scopedArea = area === ALL_LOCATIONS ? undefined : area;
  const { sinceMs, untilMs } = durationRangeMs(duration);

  // Keyed on the debounced term, not the raw one, so the cursor is dropped at
  // the same moment the query arguments actually change.
  const filterKey = `${status}|${area}|${debouncedSearch}|${sinceMs ?? ""}|${untilMs ?? ""}`;

  const { paginationOpts, page, hasPrevious, next, previous } = useCursorPagination(
    PAGE_SIZE,
    filterKey,
  );

  const areas = useQuery(api.sites.areas);
  const latestImport = useQuery(api.sites.latestImport);

  // `useStickyValue` keeps the current page on screen while the next one loads
  // instead of dropping back to "Loading…" on every change.
  const result = useStickyValue(
    useQuery(api.sites.list, {
      paginationOpts,
      status: status === "all" ? undefined : status,
      area: scopedArea,
      search: debouncedSearch,
      since_ms: sinceMs,
      until_ms: untilMs,
    }),
  );
  const counts = useStickyValue(
    useQuery(api.sites.counts, {
      area: scopedArea,
      search: debouncedSearch,
      since_ms: sinceMs,
      until_ms: untilMs,
    }),
  );

  // No arguments, so Convex computes this once per data change and shares it —
  // filtering as the user types happens in the browser.
  const searchOptions = useQuery(api.sites.searchOptions);

  // Deleting is admin-only. The backend enforces it too — this only decides
  // whether office staff are shown a control they would be refused.
  const currentUser = useQuery(api.users.currentUser);
  const canDelete = currentUser?.role === "admin";

  const deleteSites = useMutation(api.sites.deleteSites);

  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  // Set by the header checkbox, where the ids never reach the browser and the
  // filter is re-evaluated server-side instead.
  const [allMatching, setAllMatching] = useState(false);
  // Rows un-ticked out of a whole-filter selection.
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [deletedSoFar, setDeletedSoFar] = useState<number | null>(null);

  // Change the filter and the old selection no longer describes anything the
  // operator can see — keeping it invites deleting rows off-screen.
  useEffect(() => {
    setPicked(new Set());
    setAllMatching(false);
    setExcluded(new Set());
  }, [filterKey]);

  const pageIds = useMemo(() => (result?.page ?? []).map((row) => row._id), [result]);
  const totalMatching = counts?.[status] ?? 0;
  const selectedCount = allMatching ? totalMatching - excluded.size : picked.size;

  // What the table paints as ticked. Under a whole-filter selection every row
  // on the page counts as ticked unless it has been explicitly un-ticked.
  const selectedKeys = useMemo(
    () =>
      allMatching ? new Set(pageIds.filter((id) => !excluded.has(id))) : new Set(picked),
    [allMatching, excluded, picked, pageIds],
  );

  function clearSelection() {
    setPicked(new Set());
    setAllMatching(false);
    setExcluded(new Set());
  }

  function toggleRow(id: string) {
    // Under a whole-filter selection a tick removes a row rather than adding
    // one, so it is recorded as an exclusion. Dropping back to an explicit
    // list is not an option — the other pages of ids were never sent here.
    const update = (previous: ReadonlySet<string>) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    };

    if (allMatching) setExcluded(update);
    else setPicked(update);
  }

  // The header box covers the filter, not the page. Ticking 25 rows at a time
  // is no use for clearing a few hundred test sites.
  function toggleAll(checked: boolean) {
    setPicked(new Set());
    setExcluded(new Set());
    setAllMatching(checked);
  }

  async function handleDelete() {
    setDeletedSoFar(0);
    let done = 0;
    let unlinked = 0;

    try {
      if (allMatching) {
        let remaining = 1;
        while (remaining > 0) {
          const outcome = await deleteSites({
            filter: {
              status: status === "all" ? undefined : status,
              area: scopedArea,
              search: debouncedSearch,
              since_ms: sinceMs,
              until_ms: untilMs,
              exclude: [...excluded] as Id<"sites">[],
            },
          });
          done += outcome.deleted;
          unlinked += outcome.unlinked;
          remaining = outcome.remaining;
          setDeletedSoFar(done);
          // A batch that deletes nothing while claiming rows remain would spin
          // forever; stop rather than hammer the deployment.
          if (outcome.deleted === 0) break;
        }
      } else {
        for (const batch of chunk([...picked] as Id<"sites">[], DELETE_CHUNK)) {
          const outcome = await deleteSites({ ids: batch });
          done += outcome.deleted;
          unlinked += outcome.unlinked;
          setDeletedSoFar(done);
        }
      }

      toast.success(
        `Deleted ${done.toLocaleString()} site${done === 1 ? "" : "s"}` +
          (unlinked > 0
            ? `, ${unlinked.toLocaleString()} work order${unlinked === 1 ? "" : "s"} moved to Missing Sites`
            : ""),
      );
      clearSelection();
      setIsConfirmOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete sites");
    } finally {
      setDeletedSoFar(null);
    }
  }

  const uploadedOn =
    latestImport == null
      ? null
      : new Date(latestImport.uploaded_at).toLocaleString(undefined, {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

  return (
    <>
      <PageHeader
        title="Manage Site Data"
        description="Browse, filter and manage all imported site data."
      />
      <div className="flex flex-col gap-4 px-4 py-6">
        <SiteStats />

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <FilterBar
            search={search}
            searchOptions={searchOptions}
            area={area}
            areas={areas}
            status={status}
            duration={duration}
            onSearchChange={setSearch}
            onAreaChange={setArea}
            onStatusChange={setStatus}
            onDurationChange={setDuration}
            onAddSite={() => setIsAddOpen(true)}
          />

          <Tabs
            value={status}
            onValueChange={(value) => setStatus(value as SiteDetailStatusTab)}
            className="gap-0 overflow-x-auto overflow-y-hidden"
          >
            <TabsList
              variant="line"
              className="h-auto w-full gap-10 border-b border-gray-200 bg-gray-50/50 px-6 pt-4 pb-0"
            >
              {SITE_DETAIL_STATUS_TABS.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="px-1 pb-4 text-sm font-medium data-active:text-blue-600 data-active:after:bg-blue-500"
                >
                  {tab.label} ({(counts?.[tab.value] ?? 0).toLocaleString()})
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {canDelete && selectedCount > 0 && (
            <WorkOrderSelectionBanner
              selectedCount={selectedCount}
              onClear={clearSelection}
              onDelete={() => setIsConfirmOpen(true)}
            />
          )}

          {/* Fixed layout with explicit widths so one long value cannot
              stretch a column — it wraps and grows the row instead. Min-width
              keeps every column readable, scrolling sideways instead.
              `TableScrollArea` owns the scrolling, so the table's own
              container is told not to, or the two would nest. */}
          <TableScrollArea>
            <Table containerClassName="overflow-visible" className={`${canDelete ? "min-w-[1744px]" : "min-w-[1700px]"} table-fixed`}>
              <TableHeader>
                <TableRow className="border-slate-200 bg-gray-50 hover:bg-gray-50">
                  {canDelete && (
                    <TableHead className="w-[44px] px-4 py-5 align-top">
                      <div className="flex h-[17px] items-center">
                        <Checkbox
                          aria-label="Select every site matching this filter"
                          checked={allMatching}
                          onCheckedChange={(checked) => toggleAll(checked === true)}
                          className={CHECKBOX_CLASS}
                        />
                      </div>
                    </TableHead>
                  )}
                  {COLUMNS.map((column) => (
                    <TableHead
                      key={column.label}
                      className={`${column.width} ${column.padding} py-5 text-[11px] font-bold tracking-[0.55px] whitespace-normal text-slate-500 uppercase`}
                    >
                      {column.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result === undefined && (
                  <TableRow>
                    <TableCell
                      colSpan={COLUMNS.length + (canDelete ? 1 : 0)}
                      className="px-6 py-10 text-center text-sm text-slate-400"
                    >
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {result?.page.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={COLUMNS.length + (canDelete ? 1 : 0)}
                      className="px-6 py-10 text-center text-sm text-slate-400"
                    >
                      No sites match this filter.
                    </TableCell>
                  </TableRow>
                )}
                {result?.page.map((row) => (
                  <TableRow
                    key={row._id}
                    className={`border-slate-100 ${
                      selectedKeys.has(row._id) ? "bg-blue-50/60" : ""
                    }`}
                  >
                    {canDelete && (
                      <TableCell className="px-4 py-4 align-top">
                        <div className="flex h-[22px] items-center">
                          <Checkbox
                            aria-label={`Select ${row.panel_id}`}
                            checked={selectedKeys.has(row._id)}
                            onCheckedChange={() => toggleRow(row._id)}
                            className={CHECKBOX_CLASS}
                          />
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="px-6 py-4 text-sm text-slate-700">
                      <CellText value={row.area} />
                    </TableCell>
                    <TableCell className="px-4 py-4 text-sm text-slate-700">
                      <CellText value={row.site} />
                    </TableCell>
                    <TableCell className="px-4 py-4 text-sm font-medium text-slate-700">
                      <CellText value={row.panel_id} />
                    </TableCell>
                    <TableCell className="px-4 py-4 text-sm text-slate-500">
                      <CellText value={row.quantity} />
                    </TableCell>
                    <TableCell className="px-4 py-4 text-sm text-slate-500">
                      <CellText value={row.size} />
                    </TableCell>
                    <TableCell className="px-4 py-4 text-sm text-slate-500">
                      <CellText value={row.area_progress} />
                    </TableCell>
                    <TableCell className="px-4 py-4 text-sm text-slate-500">
                      <CellText value={row.equipment_needed.join(", ")} />
                    </TableCell>
                    <TableCell className="px-4 py-4 text-sm text-slate-500">
                      <CellText value={row.install_notes} />
                    </TableCell>
                    <TableCell className="px-4 py-4 text-sm text-slate-500">
                      <CellText value={row.location} />
                    </TableCell>
                    <TableCell className="px-4 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${SITE_DETAIL_STATUS_CLASSES[row.detail_status]}`}
                      >
                        {SITE_DETAIL_STATUS_LABELS[row.detail_status]}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-4">
                      <Link
                        to="/edit-site/$siteId"
                        params={{ siteId: row._id }}
                        className="inline-block rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium whitespace-nowrap text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
                      >
                        Add Images
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScrollArea>

          <TablePagination
            shown={result?.page.length ?? 0}
            total={counts?.[status] ?? 0}
            page={page}
            pageSize={PAGE_SIZE}
            hasPrevious={hasPrevious}
            hasNext={result !== undefined && !result.isDone}
            onPrevious={previous}
            onNext={() => result !== undefined && next(result.continueCursor)}
          />
        </section>

        {latestImport != null && uploadedOn !== null && (
          <ImportSummaryCard
            name={latestImport.file_name}
            badgeText={`${latestImport.total_rows.toLocaleString()} Rows`}
            lines={[`Uploaded on ${uploadedOn} · Uploaded by ${latestImport.uploaded_by_name}`]}
          />
        )}
      </div>

      <AddSiteDialog open={isAddOpen} onOpenChange={setIsAddOpen} />

      <DeleteSitesDialog
        open={isConfirmOpen}
        total={selectedCount}
        deletedSoFar={deletedSoFar}
        onOpenChange={setIsConfirmOpen}
        onConfirm={handleDelete}
      />
    </>
  );
}
