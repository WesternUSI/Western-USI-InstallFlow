import { createFileRoute } from "@tanstack/react-router";

import { FilterSelect } from "@/components/filter-select";
import { PagedTable, Panel, RowAction, SafetyButton, SafetyPage, SearchBox, StatusBadge, Toolbar, statusLabel, type SafetyStatus } from "@/components/whs/safety-ui";
import { formatIsoDate } from "@/lib/upload-file";
import { useRegister } from "@/lib/use-register";
import { useListState } from "@/lib/use-list-state";

export const Route = createFileRoute("/_auth/safety/kits/")({
  component: FirstAidKits,
});

const ALL = "all";
const STATUSES: SafetyStatus[] = ["current", "due-soon", "overdue", "action-required"];

/** FA1 First-Aid Kits (framework 4F), real data. */
function FirstAidKits() {
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
      row.category === "first-aid" &&
      (needle === "" || `${row.name} ${row.person ?? ""} ${statusLabel(row.status)}`.toLowerCase().includes(needle)) &&
      (entity === ALL || row.entity === entity) &&
      (status === ALL || row.status === status),
  );

  return (
    <SafetyPage title="First-Aid Kits" description="Track inspections, stock expiry and corrective actions for every kit.">
      <Panel>
        <Toolbar>
          <div className="w-full sm:flex-1">
            <SearchBox value={query} onChange={setQuery} placeholder="Search kit, location, installer" />
          </div>
          <FilterSelect label="Entity" value={entity} onChange={setEntity} options={[{ value: ALL, label: "All" }, ...(data?.entities ?? []).map((value) => ({ value, label: value }))]} />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: ALL, label: "All" }, ...STATUSES.map((value) => ({ value, label: statusLabel(value) }))]} />
          <SafetyButton to="/safety/records/new/kit" className="h-[38px]">
            + Add Kit
          </SafetyButton>
        </Toolbar>
        <PagedTable
          page={list.page}
            onPage={list.setPage}
          noun="kits"
          rows={rows}
          rowKey={(row) => row.id}
          empty={data === undefined ? "Loading…" : "No kits match."}
          columns={[
            { key: "kit", header: "Kit / location", render: (row) => <span className="text-[#111827]">{row.name.replace(/^Kit /, "")}</span> },
            { key: "assigned", header: "Assigned to", render: (row) => row.person ?? "Not assigned" },
            { key: "entity", header: "Entity", render: (row) => row.entity },
            { key: "next", header: "Next inspection", render: (row) => formatIsoDate(row.due) },
            { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
            {
              key: "action",
              header: "Action",
              align: "right",
              render: (row) =>
                row.status === "action-required" ? (
                  <RowAction to="/safety/kits/$kitId/corrective-action" params={{ kitId: row.id }}>Resolve</RowAction>
                ) : row.status === "overdue" || row.status === "due-soon" ? (
                  <RowAction to="/safety/kits/$kitId/assign" params={{ kitId: row.id }}>Assign</RowAction>
                ) : (
                  <RowAction to="/safety/kits/$kitId" params={{ kitId: row.id }}>Open</RowAction>
                ),
            },
          ]}
        />
      </Panel>
    </SafetyPage>
  );
}
