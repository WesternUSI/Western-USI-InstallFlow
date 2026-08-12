import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@usi-installer/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usi-installer/ui/components/table";
import { Tabs, TabsList, TabsTrigger } from "@usi-installer/ui/components/tabs";
import { useQuery } from "convex/react";
import { ListFilter } from "lucide-react";
import { useState } from "react";

import { EditSiteDialog } from "@/components/edit-site-dialog";
import { FilterSelect } from "@/components/filter-select";
import { ImportSummaryCard } from "@/components/import-summary-card";
import { PageHeader } from "@/components/page-header";
import { type SearchOption, SearchInput } from "@/components/search-input";
import { SiteStats } from "@/components/site-stats";
import { TablePagination } from "@/components/table-pagination";
import { useCursorPagination } from "@/hooks/use-cursor-pagination";
import { useDebouncedValue, useStickyValue } from "@/hooks/use-debounced-value";
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
const ALL_LOCATIONS = "__all__";

function FilterBar({
  search,
  searchOptions,
  area,
  areas,
  status,
  onSearchChange,
  onAreaChange,
  onStatusChange,
}: {
  search: string;
  searchOptions: SearchOption[] | undefined;
  area: string;
  areas: string[] | undefined;
  status: SiteDetailStatusTab;
  onSearchChange: (value: string) => void;
  onAreaChange: (value: string) => void;
  onStatusChange: (value: SiteDetailStatusTab) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
      <SearchInput
        value={search}
        options={searchOptions}
        placeholder="Search by location, panel ID, details"
        onChange={onSearchChange}
        className="max-w-md min-w-56 flex-1"
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

      <Button variant="outline" className="h-[38px] gap-2 rounded-lg">
        <ListFilter className="size-4" />
        More Filters
      </Button>
    </div>
  );
}

function ManageSiteDataPage() {
  const [status, setStatus] = useState<SiteDetailStatusTab>("all");
  const [area, setArea] = useState(ALL_LOCATIONS);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<Id<"sites"> | null>(null);

  // The box updates instantly; the queries follow once typing pauses, so a
  // word typed out is one round trip rather than one per letter.
  const debouncedSearch = useDebouncedValue(search);
  const scopedArea = area === ALL_LOCATIONS ? undefined : area;

  // Keyed on the debounced term, not the raw one, so the cursor is dropped at
  // the same moment the query arguments actually change.
  const { paginationOpts, page, hasPrevious, next, previous } = useCursorPagination(
    PAGE_SIZE,
    `${status}|${area}|${debouncedSearch}`,
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
    }),
  );
  const counts = useStickyValue(
    useQuery(api.sites.counts, { area: scopedArea, search: debouncedSearch }),
  );

  // No arguments, so Convex computes this once per data change and shares it —
  // filtering as the user types happens in the browser.
  const searchOptions = useQuery(api.sites.searchOptions);

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
            onSearchChange={setSearch}
            onAreaChange={setArea}
            onStatusChange={setStatus}
          />

          <Tabs
            value={status}
            onValueChange={(value) => setStatus(value as SiteDetailStatusTab)}
            className="gap-0"
          >
            <TabsList
              variant="line"
              className="h-auto gap-10 border-b border-gray-200 bg-gray-50/50 px-8 pt-4 pb-0"
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

          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 bg-gray-50 hover:bg-gray-50">
                {["Location", "Site Details", "Panel ID", "Material Size", "Details Status"].map(
                  (heading) => (
                    <TableHead
                      key={heading}
                      className="px-6 py-5 text-[11px] font-bold tracking-[0.55px] text-slate-500 uppercase"
                    >
                      {heading}
                    </TableHead>
                  ),
                )}
                <TableHead className="px-6 py-5 text-right text-[11px] font-bold tracking-[0.55px] text-slate-500 uppercase">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result === undefined && (
                <TableRow>
                  <TableCell colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {result?.page.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400">
                    No sites match this filter.
                  </TableCell>
                </TableRow>
              )}
              {result?.page.map((row) => (
                <TableRow key={row._id} className="border-slate-100">
                  <TableCell className="px-6 py-4 text-sm text-slate-700">{row.area}</TableCell>
                  <TableCell className="max-w-64 truncate px-6 py-4 text-sm text-slate-700">
                    {row.site}
                  </TableCell>
                  <TableCell className="px-6 py-4 text-sm font-medium text-slate-700">
                    {row.panel_id}
                  </TableCell>
                  <TableCell className="px-6 py-4 text-sm text-slate-500">
                    {row.size ?? "—"}
                  </TableCell>
                  <TableCell className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${SITE_DETAIL_STATUS_CLASSES[row.detail_status]}`}
                    >
                      {SITE_DETAIL_STATUS_LABELS[row.detail_status]}
                    </span>
                  </TableCell>
                  <TableCell className="px-6 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => setEditingId(row._id)}
                      className="text-sm font-medium text-blue-600 hover:text-blue-700"
                    >
                      Edit Details
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

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

      <EditSiteDialog siteId={editingId} onClose={() => setEditingId(null)} />
    </>
  );
}
