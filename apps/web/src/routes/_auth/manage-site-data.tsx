import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@usi-installer/ui/components/button";
import { Input } from "@usi-installer/ui/components/input";
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
import { ListFilter, Search } from "lucide-react";
import { useState } from "react";

import { EditSiteDialog } from "@/components/edit-site-dialog";
import { ImportSummaryCard } from "@/components/import-summary-card";
import { PageHeader } from "@/components/page-header";
import { SiteStats } from "@/components/site-stats";
import { TablePagination } from "@/components/table-pagination";
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
  area,
  areas,
  status,
  onSearchChange,
  onAreaChange,
  onStatusChange,
}: {
  search: string;
  area: string;
  areas: string[] | undefined;
  status: SiteDetailStatusTab;
  onSearchChange: (value: string) => void;
  onAreaChange: (value: string) => void;
  onStatusChange: (value: SiteDetailStatusTab) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
      <div className="relative max-w-md min-w-56 flex-1">
        <Search className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by location, panel ID, details"
          className="h-[38px] rounded-lg pl-10 text-sm"
        />
      </div>

      <label className="relative">
        <span className="absolute -top-2 left-3 z-10 bg-white px-1 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
          Location
        </span>
        <select
          value={area}
          onChange={(event) => onAreaChange(event.target.value)}
          className="h-[38px] w-48 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800"
        >
          <option value={ALL_LOCATIONS}>All</option>
          {areas?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label className="relative">
        <span className="absolute -top-2 left-3 z-10 bg-white px-1 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
          Details Status
        </span>
        <select
          value={status}
          onChange={(event) => onStatusChange(event.target.value as SiteDetailStatusTab)}
          className="h-[38px] w-48 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800"
        >
          {SITE_DETAIL_STATUS_TABS.map((tab) => (
            <option key={tab.value} value={tab.value}>
              {tab.value === "all" ? "All" : tab.label}
            </option>
          ))}
        </select>
      </label>

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
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<Id<"sites"> | null>(null);

  const areas = useQuery(api.sites.areas);
  const latestImport = useQuery(api.sites.latestImport);
  const result = useQuery(api.sites.list, {
    status: status === "all" ? undefined : status,
    area: area === ALL_LOCATIONS ? undefined : area,
    search,
    page,
    page_size: PAGE_SIZE,
  });

  function resetToFirstPage<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
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
            area={area}
            areas={areas}
            status={status}
            onSearchChange={resetToFirstPage(setSearch)}
            onAreaChange={resetToFirstPage(setArea)}
            onStatusChange={resetToFirstPage(setStatus)}
          />

          <Tabs
            value={status}
            onValueChange={(value) => resetToFirstPage(setStatus)(value as SiteDetailStatusTab)}
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
                  {tab.label} ({(result?.counts[tab.value] ?? 0).toLocaleString()})
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
              {result?.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400">
                    No sites match this filter.
                  </TableCell>
                </TableRow>
              )}
              {result?.rows.map((row) => (
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
            total={result?.total ?? 0}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
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
