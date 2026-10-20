import { createFileRoute } from "@tanstack/react-router";

import { FilterSelect } from "@/components/filter-select";
import { MgmtPage } from "@/components/whs/management";
import {
  AccreditationViewSwitch,
  PagedTable,
  Panel,
  RowAction,
  SearchBox,
  StatusBadge,
  Toolbar,
  statusLabel,
  type SafetyStatus,
} from "@/components/whs/safety-ui";
import { formatIsoDate } from "@/lib/upload-file";
import { useListState } from "@/lib/use-list-state";
import { toVerify, useRegister } from "@/lib/use-register";

export const Route = createFileRoute("/_management/management/accreditations/")({
  component: WorkerAccreditations,
});

const ALL = "all";
const STATUSES: SafetyStatus[] = ["current", "due-soon", "expired", "missing", "awaiting-verification", "renewal-in-progress", "action-required"];

/**
 * Worker Accreditations for management (decision AD44): the admin's list,
 * read-only, with the same List / Matrix switch. "Review" opens anything
 * waiting for verification; there is no Add Record.
 */
function WorkerAccreditations() {
  const data = useRegister();
  const list = useListState();
  const query = list.get("q", "");
  const entity = list.get("entity", ALL);
  const status = list.get("status", ALL);

  const needle = query.trim().toLowerCase();
  const rows = (data?.rows ?? []).filter(
    (row) =>
      row.category === "accreditation" &&
      (needle === "" || `${row.name} ${row.person ?? ""} ${row.entity}`.toLowerCase().includes(needle)) &&
      (entity === ALL || row.entity === entity) &&
      (status === ALL || row.status === status),
  );

  return (
    <MgmtPage title="Worker Accreditations" description="Management · Cards, licences and inductions for installers and subcontractor workers">
      <AccreditationViewSwitch active="list" management />
      <Panel>
        <Toolbar>
          <SearchBox value={query} onChange={(value) => list.set("q", value)} placeholder="Record, worker, entity" />
          <FilterSelect
            label="Entity"
            value={entity}
            onChange={(value) => list.set("entity", value)}
            options={[{ value: ALL, label: "All" }, ...(data?.entities ?? []).map((value) => ({ value, label: value }))]}
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={(value) => list.set("status", value)}
            options={[{ value: ALL, label: "All" }, ...STATUSES.map((value) => ({ value, label: statusLabel(value) }))]}
          />
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
                <RowAction to="/management/accreditations/$key" params={{ key: row.id }}>
                  {toVerify(row) ? "Review" : "Open"}
                </RowAction>
              ),
            },
          ]}
        />
      </Panel>
    </MgmtPage>
  );
}
