import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { FilterSelect } from "@/components/filter-select";
import { PagedTable, Notice, Panel, RowAction, SafetyButton, SafetyPage, SearchBox, StatusBadge, Toolbar } from "@/components/whs/safety-ui";
import { formatIsoDate } from "@/lib/upload-file";
import { vehicleBadge } from "@/lib/vehicle-status";
import { useListState } from "@/lib/use-list-state";

export const Route = createFileRoute("/_auth/safety/vehicles/")({
  component: VehicleRegister,
});

const ALL = "all";
const STATUSES = [
  { value: "current", label: "Current" },
  { value: "service-due-soon", label: "Service due soon" },
  { value: "service-overdue", label: "Service overdue" },
  { value: "registration-expiring", label: "Registration expiring" },
  { value: "registration-expired", label: "Registration expired" },
  { value: "insurance-expiring", label: "Insurance expiring" },
  { value: "insurance-expired", label: "Insurance expired" },
  { value: "out-of-service", label: "Out of service" },
];

/** D1 Vehicle Register (framework 4E), real data. Western USI vehicles only (VH4). */
function VehicleRegister() {
  const vehicles = useQuery(api.vehicles.list);
  const list = useListState();
  const query = list.get("q", "");
  const setQuery = (value: string) => list.set("q", value);
  const status = list.get("status", ALL);
  const setStatus = (value: string) => list.set("status", value);
  const needle = query.trim().toLowerCase();
  const rows = (vehicles ?? []).filter(
    (vehicle) =>
      (needle === "" || `${vehicle.registration} ${vehicle.vin ?? ""} ${vehicle.make_model}`.toLowerCase().includes(needle)) &&
      (status === ALL || vehicle.status === status),
  );

  return (
    <SafetyPage title="Vehicle Register" description="Monitor registration, insurance and servicing for Western USI vehicles.">
      <Notice tone="info">Completing a service doesn't renew registration or insurance; each date is tracked on its own.</Notice>
      <Panel>
        <Toolbar>
          <div className="w-full sm:flex-1">
            <SearchBox value={query} onChange={setQuery} placeholder="Search registration, VIN" />
          </div>
          <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: ALL, label: "All" }, ...STATUSES]} />
          <SafetyButton to="/safety/records/new/vehicle" className="h-[38px]">
            + Add Vehicle Record
          </SafetyButton>
        </Toolbar>
        <PagedTable
          page={list.page}
            onPage={list.setPage}
          noun="vehicles"
          rows={rows}
          rowKey={(row) => row.id}
          empty={vehicles === undefined ? "Loading…" : "No vehicles yet. Add one to start the register."}
          columns={[
            {
              key: "vehicle",
              header: "Vehicle",
              render: (row) => (
                <div className="flex flex-col">
                  <span className="text-[#111827]">{row.registration}</span>
                  <span className="text-xs font-normal text-[#64748b]">
                    {row.make_model}
                    {row.year ? ` ${row.year}` : ""}
                  </span>
                </div>
              ),
            },
            { key: "rego", header: "Registration due", render: (row) => formatIsoDate(row.registration_expiry) },
            { key: "insurance", header: "Insurance due", render: (row) => formatIsoDate(row.insurance_expiry) },
            { key: "service", header: "Next service", render: (row) => formatIsoDate(row.next_service) },
            { key: "status", header: "Status", render: (row) => <StatusBadge status={vehicleBadge(row.status)} label={row.status_label} /> },
            {
              key: "action",
              header: "Action",
              align: "right",
              render: (row) =>
                row.status === "service-overdue" || row.status === "service-due-soon" ? (
                  <RowAction to="/safety/vehicles/$vehicleId/service" params={{ vehicleId: row.id }}>Service</RowAction>
                ) : (
                  <RowAction to="/safety/vehicles/$vehicleId" params={{ vehicleId: row.id }}>Open</RowAction>
                ),
            },
          ]}
        />
      </Panel>
    </SafetyPage>
  );
}
