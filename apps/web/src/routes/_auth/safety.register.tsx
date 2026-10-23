import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { FilterSelect } from "@/components/filter-select";
import {
  PagedTable,
  Panel,
  RowAction,
  SafetyButton,
  SafetyPage,
  SearchBox,
  StatusBadge,
    Toolbar,
} from "@/components/whs/safety-ui";
import { useListState } from "@/lib/use-list-state";
import { type RegisterRow, useRegister } from "@/lib/use-register";

/**
 * The register's filters, kept in the URL so each dashboard card can open
 * "the filtered list behind it" (framework 9). Empty means "all". `from`/`to`
 * are the due-date range the "Due within" cards set; they have no control of
 * their own for now.
 */
export interface RegisterSearch {
  q?: string;
  page?: string;
  category?: string;
  /** "w:<worker name>" or "s:<subcontractor name>" (framework 9 "Worker or subcontractor"). */
  person?: string;
  vehicle?: string;
  responsible?: string;
  entity?: string;
  status?: string;
  from?: string;
  to?: string;
}

const KEYS: (keyof RegisterSearch)[] = ["q", "page", "category", "entity", "status", "person", "vehicle", "responsible", "from", "to"];
/** The keys that are filters (everything but the page). */
const FILTERS: (keyof RegisterSearch)[] = ["q", "category", "entity", "status", "person", "vehicle", "responsible", "from", "to"];
/** The filters behind "More filters" (framework 9's other four). */
const MORE: (keyof RegisterSearch)[] = ["person", "vehicle", "responsible", "from", "to"];

export const Route = createFileRoute("/_auth/safety/register")({
  validateSearch: (search: Record<string, unknown>): RegisterSearch =>
    Object.fromEntries(KEYS.flatMap((key) => (typeof search[key] === "string" && search[key] !== "" ? [[key, search[key]]] : []))),
  component: RegisterScreen,
});

const ALL = "all";

/** Framework 5's categories. Other safety documents (4A) are listed by their own type, "type:<name>" (decision AD48). */
const CATEGORIES = [
  { value: "insurance", label: "Insurance" },
  { value: "vehicle", label: "Vehicle" },
  { value: "accreditation", label: "Accreditation" },
  { value: "swms", label: "SWMS" },
  { value: "sds", label: "SDS" },
  { value: "first-aid", label: "First aid" },
];
const TYPE_PREFIX = "type:";

function matchesCategory(row: RegisterRow, category: string): boolean {
  if (category.startsWith(TYPE_PREFIX)) return row.category === "document" && row.type === category.slice(TYPE_PREFIX.length);
  return row.category === category;
}

/** Framework 6's statuses ("Overdue/Expired" is one), plus "Needs action" (vehicle and first-aid cards) and "Acknowledgements outstanding" (SWMS card). */
const STATUSES = [
  { value: "current", label: "Current" },
  { value: "due-soon", label: "Due soon" },
  { value: "overdue", label: "Overdue / Expired" },
  { value: "missing", label: "Missing" },
  { value: "awaiting-verification", label: "Awaiting verification" },
  { value: "action-required", label: "Action required" },
  { value: "renewal-in-progress", label: "Renewal in progress" },
  { value: "out-of-service", label: "Out of service" },
  { value: "needs-action", label: "Needs action (anything not current)" },
  { value: "acks-outstanding", label: "Acknowledgements outstanding" },
  { value: "changes-to-review", label: "On-site changes to review" },
];

/** Filters the dashboard cards use that aren't framework statuses; hidden from the dropdown. */
const HELPER_STATUSES = ["needs-action", "acks-outstanding", "changes-to-review"];

function matchesStatus(row: RegisterRow, status: string): boolean {
  if (status === "overdue") return row.status === "overdue" || row.status === "expired";
  if (status === "needs-action") return row.status !== "current";
  if (status === "acks-outstanding") return (row.outstanding ?? 0) > 0;
  if (status === "changes-to-review") return (row.changes_to_review ?? 0) > 0;
  return row.status === status;
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * A2 WHS & Compliance Register, with A8's empty state. Real data from
 * `whsAdmin.register`: accreditations, safety documents and kits.
 */
function RegisterScreen() {
  const search = Route.useSearch();
  const list = useListState();
  const query = search.q ?? "";
  const setQuery = (value: string) => list.set("q", value);
  const data = useRegister();

  const set = (key: keyof RegisterSearch, value: string) => list.set(key, value);

  const needle = query.trim().toLowerCase();
  const rows = (data?.rows ?? []).filter(
    (row) =>
      (needle === "" || `${row.name} ${row.person ?? ""} ${row.entity}`.toLowerCase().includes(needle)) &&
      (!search.category || matchesCategory(row, search.category)) &&
      (!search.entity || row.entity === search.entity) &&
      (!search.status || matchesStatus(row, search.status)) &&
      (!search.person ||
        (search.person.startsWith("s:") ? row.entity === search.person.slice(2) : row.person === search.person.slice(2))) &&
      (!search.vehicle || row.vehicle === search.vehicle) &&
      (!search.responsible || row.responsible === search.responsible) &&
      (!search.from || (row.due !== undefined && row.due >= search.from)) &&
      (!search.to || (row.due !== undefined && row.due <= search.to)),
  );
  const filtered = FILTERS.some((key) => search[key]);
  const moreApplied = MORE.some((key) => search[key]);
  const [moreOpen, setMoreOpen] = useState(moreApplied);
  const showMore = moreOpen || moreApplied;

  const allRows = data?.rows ?? [];
  const distinct = (values: (string | undefined)[]) => [...new Set(values.filter((value): value is string => !!value))].sort();
  const personOptions = [
    ...distinct(allRows.map((row) => row.person)).map((name) => ({ value: `w:${name}`, label: name })),
    ...(data?.entities ?? []).filter((name) => name !== "Western USI").map((name) => ({ value: `s:${name}`, label: `${name} (subcontractor)` })),
  ];
  const vehicleOptions = distinct(allRows.map((row) => row.vehicle)).map((value) => ({ value, label: value }));
  const responsibleOptions = distinct(allRows.map((row) => row.responsible)).map((value) => ({ value, label: value }));
  const documentTypes = distinct(allRows.filter((row) => row.category === "document").map((row) => row.type));
  const categoryOptions = [
    ...CATEGORIES.slice(0, 5),
    ...documentTypes.map((type) => ({ value: `${TYPE_PREFIX}${type}`, label: type })),
    ...CATEGORIES.slice(5),
  ];

  const clear = () => list.clear(FILTERS);

  const select = (label: string, key: keyof RegisterSearch, options: { value: string; label: string }[]) => (
    <FilterSelect label={label} value={search[key] ?? ALL} onChange={(value) => set(key, value)} options={[{ value: ALL, label: "All" }, ...options]} />
  );

  const toolbar = (
    <Toolbar>
      <SearchBox value={query} onChange={setQuery} placeholder="Search Records" />
      {select("Category", "category", categoryOptions)}
      {select("Entity", "entity", (data?.entities ?? []).map((value) => ({ value, label: value })))}
      {select(
        "Status",
        "status",
        // The two helper choices only the dashboard cards use are listed only while one is applied.
        STATUSES.filter((entry) => !HELPER_STATUSES.includes(entry.value) || entry.value === search.status),
      )}
      {!showMore && (search.from || search.to) ? (
        <span className="text-[13px] text-[#475569]">
          Due {search.from ? formatDate(search.from) : "any time"} – {search.to ? formatDate(search.to) : "any time"}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => setMoreOpen((open) => !open)}
        className="h-[38px] px-1 text-[13px] font-semibold text-[#2563eb] hover:underline"
        aria-expanded={showMore}
      >
        {showMore ? "Fewer filters" : "More filters"}
      </button>
      {filtered ? (
        <button type="button" onClick={clear} className="h-[38px] px-1 text-[13px] font-semibold text-[#2563eb] hover:underline">
          Clear filters
        </button>
      ) : null}
      <SafetyButton to="/safety/records/new" className="h-[38px] sm:ml-auto">
        + Add Record
      </SafetyButton>
    </Toolbar>
  );
  const moreRow = showMore ? (
    <div className="flex flex-wrap items-end gap-3 border-b border-[#f3f4f6] px-4 pt-1 pb-4 sm:gap-[14px]">
      {select("Worker or subcontractor", "person", personOptions)}
      {select("Vehicle", "vehicle", vehicleOptions)}
      {select("Responsible person", "responsible", responsibleOptions)}
      {(["from", "to"] as const).map((key) => (
        <label key={key} className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">{key === "from" ? "Due from" : "Due to"}</span>
          <input
            type="date"
            value={search[key] ?? ""}
            onChange={(event) => set(key, event.target.value)}
            className="h-[38px] rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800"
          />
        </label>
      ))}
    </div>
  ) : null;

  return (
    <SafetyPage
      title="WHS & Compliance Register"
      description="A single register for documents, people, insurance, vehicles and kits."
      back={{ to: "/safety", label: "Safety Dashboard" }}
    >
      {data !== undefined && rows.length === 0 && filtered ? (
        <>
          <Panel>
            {toolbar}
            {moreRow}
          </Panel>
          <Panel className="flex flex-col gap-4 p-6 sm:p-8">
            <h2 className="text-[22px] font-semibold text-[#111827]">No matching records</h2>
            <p className="text-sm text-[#64748b]">
              No records match the current search and filters. Clear the filters or try a different record name.
            </p>
            <div className="flex flex-wrap gap-3">
              <SafetyButton onClick={clear}>Clear Filters</SafetyButton>
              <SafetyButton variant="secondary" to="/safety/records/new">
                Add Record
              </SafetyButton>
            </div>
          </Panel>
        </>
      ) : (
        <Panel>
          {toolbar}
          {moreRow}
          <PagedTable
            page={list.page}
            onPage={list.setPage}
            rows={rows}
            rowKey={(row) => row.id}
            empty={data === undefined ? "Loading…" : "Nothing in the register yet."}
            columns={[
              {
                key: "record",
                header: "Record",
                render: (row) => (
                  <div className="flex flex-col">
                    <span className="text-[#111827]">{row.name}</span>
                    {row.person ? <span className="text-xs font-normal text-[#64748b]">{row.person}</span> : null}
                  </div>
                ),
              },
              { key: "category", header: "Category", render: (row) => row.type ?? CATEGORIES.find((entry) => entry.value === row.category)?.label },
              { key: "entity", header: "Entity", render: (row) => row.entity },
              {
                key: "due",
                header: "Due",
                render: (row) => (
                  <div className="flex flex-col">
                    <span>{row.due ? formatDate(row.due) : "—"}</span>
                    {row.outstanding ? <span className="text-xs font-normal text-[#dc2626]">{row.outstanding} to acknowledge</span> : null}
                    {row.changes_to_review ? (
                      <span className="text-xs font-normal text-[#b45309]">
                        {row.changes_to_review} on-site {row.changes_to_review === 1 ? "change" : "changes"} to review
                      </span>
                    ) : null}
                  </div>
                ),
              },
              { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} label={row.label} /> },
              {
                key: "actions",
                header: "Actions",
                align: "right",
                render: (row) =>
                  row.category === "accreditation" ? (
                    <RowAction to="/safety/accreditations/$accreditationId" params={{ accreditationId: row.id }}>
                      Open
                    </RowAction>
                  ) : row.category === "insurance" ? (
                    <RowAction to="/safety/insurance/$policyId" params={{ policyId: row.id }}>
                      Open
                    </RowAction>
                  ) : row.category === "vehicle" ? (
                    <RowAction to="/safety/vehicles/$vehicleId" params={{ vehicleId: row.id }}>
                      Open
                    </RowAction>
                  ) : row.category === "first-aid" ? (
                    <RowAction to="/safety/kits/$kitId" params={{ kitId: row.id }}>
                      Open
                    </RowAction>
                  ) : (
                    <RowAction to="/safety/documents/$documentId" params={{ documentId: row.id }}>
                      Open
                    </RowAction>
                  ),
              },
            ]}
          />
        </Panel>
      )}
    </SafetyPage>
  );
}
