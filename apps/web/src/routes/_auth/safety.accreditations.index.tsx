import { createFileRoute } from "@tanstack/react-router";

import { FilterSelect } from "@/components/filter-select";
import {
  AccreditationViewSwitch,
  PagedTable,
  Panel,
  RowAction,
  SafetyButton,
  SafetyPage,
  SearchBox,
  StatusBadge,
    Toolbar,
  statusLabel,
  type SafetyStatus,
} from "@/components/whs/safety-ui";
import { formatIsoDate } from "@/lib/upload-file";
import { type RegisterRow, useRegister } from "@/lib/use-register";
import { useListState } from "@/lib/use-list-state";

export const Route = createFileRoute("/_auth/safety/accreditations/")({
  component: WorkerAccreditations,
});

const ALL = "all";
const STATUSES: SafetyStatus[] = ["current", "due-soon", "expired", "missing", "awaiting-verification", "renewal-in-progress", "action-required"];

/** The table's action, by status (Figma B1). */
function accreditationAction(row: RegisterRow): string {
  switch (row.status) {
    case "awaiting-verification":
    case "renewal-in-progress":
      return "Verify";
    case "missing":
      return "Upload";
    case "expired":
    case "due-soon":
    case "action-required":
      return "Renew";
    default:
      return "Open";
  }
}

/** B1 Worker Accreditations (framework 4B), real data: every required accreditation of every worker. */
function WorkerAccreditations() {
  const data = useRegister();
  const list = useListState();
  const query = list.get("q", "");
  const setQuery = (value: string) => list.set("q", value);
  const entity = list.get("entity", ALL);
  const setEntity = (value: string) => list.set("entity", value);
  const status = list.get("status", ALL);
  const setStatus = (value: string) => list.set("status", value);

  const needle = query.trim().toLowerCase();
  const rows = (data?.rows ?? []).filter(
    (row) =>
      row.category === "accreditation" &&
      (needle === "" || `${row.name} ${row.person ?? ""} ${row.entity}`.toLowerCase().includes(needle)) &&
      (entity === ALL || row.entity === entity) &&
      (status === ALL || row.status === status),
  );

  return (
    <SafetyPage title="Worker Accreditations" description="Cards, licences and inductions for your installers and subcontractor workers.">
      <AccreditationViewSwitch active="list" />
      <Panel>
        <Toolbar>
          <SearchBox value={query} onChange={setQuery} placeholder="Record, worker, entity" />
          <FilterSelect label="Entity" value={entity} onChange={setEntity} options={[{ value: ALL, label: "All" }, ...(data?.entities ?? []).map((value) => ({ value, label: value }))]} />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: ALL, label: "All" }, ...STATUSES.map((value) => ({ value, label: statusLabel(value) }))]} />
          <SafetyButton to="/safety/records/new/accreditation" className="h-[38px] sm:ml-auto">
            + Add Record
          </SafetyButton>
        </Toolbar>
        <PagedTable
          page={list.page}
            onPage={list.setPage}
          rows={rows}
          rowKey={(row) => row.id}
          empty={data === undefined ? "Loading…" : "No accreditations match."}
          columns={[
            { key: "record", header: "Record", render: (row) => <span className="text-[#111827]">{row.name}</span> },
            { key: "worker", header: "Worker", render: (row) => row.person ?? "—" },
            { key: "entity", header: "Entity", render: (row) => row.entity },
            { key: "expires", header: "Expires", render: (row) => formatIsoDate(row.due) },
            { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
            {
              key: "actions",
              header: "Actions",
              align: "right",
              render: (row) => (
                <RowAction to="/safety/accreditations/$accreditationId" params={{ accreditationId: row.id }}>
                  {accreditationAction(row)}
                </RowAction>
              ),
            },
          ]}
        />
      </Panel>
    </SafetyPage>
  );
}
