import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { FilterSelect } from "@/components/filter-select";
import { PagedTable, Panel, RowAction, SafetyButton, SafetyPage, SearchBox, StatusBadge, Toolbar, statusLabel, type SafetyStatus } from "@/components/whs/safety-ui";
import { formatIsoDate } from "@/lib/upload-file";
import { useListState } from "@/lib/use-list-state";

export const Route = createFileRoute("/_auth/safety/equipment/")({
  component: Equipment,
});

const ALL = "all";
const STATUSES: SafetyStatus[] = ["current", "overdue", "action-required", "out-of-service"];

/** Height and Safety Equipment (decision AD49): the list from Mitch's sheet, with each item's open check. */
function Equipment() {
  const items = useQuery(api.equipment.list);
  const list = useListState();
  const query = list.get("q", "");
  const setQuery = (value: string) => list.set("q", value);
  const type = list.get("type", ALL);
  const setType = (value: string) => list.set("type", value);
  const status = list.get("status", ALL);
  const setStatus = (value: string) => list.set("status", value);
  const types = [...new Set((items ?? []).map((item) => item.type))].sort();
  const needle = query.trim().toLowerCase();
  const rows = (items ?? []).filter(
    (item) =>
      (needle === "" || `${item.name} ${item.brand} ${item.type} ${item.check?.assigned_to ?? ""}`.toLowerCase().includes(needle)) &&
      (type === ALL || item.type === type) &&
      (status === ALL || item.status === status),
  );

  return (
    <SafetyPage title="Height & Safety Equipment" description="Ladders and safety steps, and the checks assigned to workers.">
      <Panel>
        <Toolbar>
          <div className="w-full sm:flex-1">
            <SearchBox value={query} onChange={setQuery} placeholder="Search by name, brand, type or worker" />
          </div>
          <FilterSelect label="Type" value={type} onChange={setType} options={[{ value: ALL, label: "All" }, ...types.map((value) => ({ value, label: value }))]} />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: ALL, label: "All" }, ...STATUSES.map((value) => ({ value, label: statusLabel(value) }))]} />
          <SafetyButton variant="secondary" to="/safety/equipment/import" className="h-[38px]">
            Import from Excel
          </SafetyButton>
          <SafetyButton to="/safety/equipment/new" className="h-[38px]">
            + Add Item
          </SafetyButton>
        </Toolbar>
        <PagedTable
          page={list.page}
          onPage={list.setPage}
          noun="items"
          rows={rows}
          rowKey={(row) => row.id}
          empty={items === undefined ? "Loading…" : "No equipment matches."}
          columns={[
            {
              key: "item",
              header: "Item",
              render: (row) => (
                <div className="flex flex-col">
                  <span className="text-[#111827]">{row.name}</span>
                  <span className="text-xs font-normal text-[#64748b]">{[row.brand, row.type].filter(Boolean).join(" · ")}</span>
                </div>
              ),
            },
            { key: "damage", header: "Damage", render: (row) => row.damage ?? "—" },
            {
              key: "check",
              header: "Check",
              render: (row) => (row.check ? `${row.check.assigned_to}, by ${formatIsoDate(row.check.due)}` : "None assigned"),
            },
            { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
            {
              key: "action",
              header: "Action",
              align: "right",
              render: (row) => (
                <RowAction to="/safety/equipment/$equipmentId" params={{ equipmentId: row.id }}>
                  Open
                </RowAction>
              ),
            },
          ]}
        />
      </Panel>
    </SafetyPage>
  );
}
