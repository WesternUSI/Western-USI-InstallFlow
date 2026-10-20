import { createFileRoute } from "@tanstack/react-router";

import { FilterSelect } from "@/components/filter-select";
import { MgmtPage, MgmtRecordAction, requiresAttention } from "@/components/whs/management";
import { PagedTable, Panel, SearchBox, StatusBadge, Toolbar } from "@/components/whs/safety-ui";
import { formatIsoDate } from "@/lib/upload-file";
import { useListState } from "@/lib/use-list-state";
import { type RegisterRow, toVerify, useRegister } from "@/lib/use-register";

interface ExceptionsSearch {
  q?: string;
  page?: string;
  entity?: string;
  /** Empty: requires attention. "everything": all records. */
  status?: string;
  /** Set by the overview cards; no control of their own. */
  category?: string;
  from?: string;
  to?: string;
}

const KEYS: (keyof ExceptionsSearch)[] = ["q", "page", "entity", "status", "category", "from", "to"];

export const Route = createFileRoute("/_management/management/exceptions")({
  validateSearch: (search: Record<string, unknown>): ExceptionsSearch =>
    Object.fromEntries(KEYS.flatMap((key) => (typeof search[key] === "string" && search[key] !== "" ? [[key, search[key]]] : []))),
  component: Exceptions,
});

const ATTENTION = "attention";

/** The Status filter: what needs attention by default, everything, or one framework 6 status. */
const STATUSES = [
  { value: ATTENTION, label: "Requires attention" },
  { value: "everything", label: "All records" },
  { value: "overdue", label: "Overdue / Expired" },
  { value: "due-soon", label: "Due soon" },
  { value: "missing", label: "Missing" },
  { value: "to-verify", label: "Awaiting verification" },
  { value: "action-required", label: "Action required" },
  { value: "out-of-service", label: "Out of service" },
  { value: "current", label: "Current" },
];

/** Filters the overview cards use that aren't in the dropdown; shown only while active. */
const HELPERS = [
  { value: "acks-outstanding", label: "SWMS acknowledgements outstanding" },
  { value: "changes-to-review", label: "On-site changes to review" },
  { value: "needs-action", label: "Needs action" },
];

const CATEGORY_LABELS: Record<string, string> = {
  insurance: "Insurance",
  vehicle: "Vehicles",
  accreditation: "Accreditations",
  swms: "SWMS",
  sds: "SDS",
  document: "Other safety documents",
  "first-aid": "First-aid kits",
};

function matches(row: RegisterRow, status: string): boolean {
  if (status === ATTENTION) return requiresAttention(row);
  if (status === "everything") return true;
  if (status === "overdue") return row.status === "overdue" || row.status === "expired";
  if (status === "to-verify") return toVerify(row);
  if (status === "needs-action") return row.status !== "current";
  if (status === "acks-outstanding") return (row.outstanding ?? 0) > 0;
  if (status === "changes-to-review") return (row.changes_to_review ?? 0) > 0;
  return row.status === status;
}

/**
 * M2 Exceptions (decision AD43): what needs attention across every entity.
 * The Status filter can show all records, so it also covers the Figma's
 * read-only Full WHS Register (M15) in one list.
 */
function Exceptions() {
  const search = Route.useSearch();
  const list = useListState();
  const data = useRegister();
  const status = search.status ?? ATTENTION;
  const needle = (search.q ?? "").trim().toLowerCase();

  const rows = (data?.rows ?? [])
    .filter(
      (row) =>
        (needle === "" || `${row.name} ${row.person ?? ""} ${row.entity}`.toLowerCase().includes(needle)) &&
        (!search.entity || row.entity === search.entity) &&
        (!search.category || row.category === search.category) &&
        (!search.from || (row.due !== undefined && row.due >= search.from)) &&
        (!search.to || (row.due !== undefined && row.due <= search.to)) &&
        matches(row, status),
    )
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));

  const helper = HELPERS.find((entry) => entry.value === status);
  const extras = [
    search.category ? CATEGORY_LABELS[search.category] ?? search.category : "",
    search.from && search.to ? `Due ${formatIsoDate(search.from)} to ${formatIsoDate(search.to)}` : "",
  ].filter(Boolean);

  return (
    <MgmtPage title="Exceptions">
      <Panel>
        <Toolbar>
          <div className="w-full sm:flex-1">
            <SearchBox value={search.q ?? ""} onChange={(value) => list.set("q", value)} placeholder="Search record or worker" />
          </div>
          <FilterSelect
            label="Entity"
            value={search.entity ?? "all"}
            options={[{ value: "all", label: "All entities" }, ...(data?.entities ?? []).map((name) => ({ value: name, label: name }))]}
            onChange={(value) => list.set("entity", value)}
          />
          <FilterSelect
            label="Status"
            value={status}
            options={helper ? [...STATUSES, helper] : STATUSES}
            onChange={(value) => list.set("status", value === ATTENTION ? "" : value)}
          />
        </Toolbar>
        {extras.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 border-b border-[#f3f4f6] px-4 py-2.5 text-[13px] text-[#64748b]">
            Showing {extras.join(" · ")}
            <button type="button" onClick={() => list.clear(["category", "from", "to"])} className="font-semibold text-[#2563eb] hover:underline">
              Clear
            </button>
          </div>
        ) : null}
        <PagedTable
          page={list.page}
          onPage={list.setPage}
          noun="records"
          rows={rows}
          rowKey={(row) => row.id}
          empty={data === undefined ? "Loading…" : "Nothing matches. Everything here is up to date."}
          columns={[
            {
              key: "record",
              header: "Record",
              render: (row) => (
                <div className="flex flex-col">
                  <span className="text-[13px] text-[#111827]">
                    {row.name}
                    {row.person ? ` · ${row.person}` : ""}
                  </span>
                  <span className="text-[11px] font-normal text-[#64748b]">{CATEGORY_LABELS[row.category] ?? row.category}</span>
                </div>
              ),
            },
            { key: "entity", header: "Related to", render: (row) => row.entity },
            { key: "due", header: "Due / expiry", render: (row) => (row.due ? formatIsoDate(row.due) : "—") },
            {
              key: "status",
              header: "Status",
              render: (row) => (
                <div className="flex flex-col items-start gap-1">
                  <StatusBadge status={row.status} label={row.label} />
                  {row.outstanding ? <span className="text-xs text-[#dc2626]">{row.outstanding} to acknowledge</span> : null}
                  {row.changes_to_review ? (
                    <span className="text-xs text-[#b45309]">
                      {row.changes_to_review} on-site {row.changes_to_review === 1 ? "change" : "changes"} to review
                    </span>
                  ) : null}
                </div>
              ),
            },
            { key: "action", header: "Action", align: "right", render: (row) => <MgmtRecordAction row={row} /> },
          ]}
        />
      </Panel>
    </MgmtPage>
  );
}
