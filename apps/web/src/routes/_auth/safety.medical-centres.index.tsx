import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { FilterSelect } from "@/components/filter-select";
import { PagedTable, Panel, SafetyButton, SafetyPage, SearchBox, Toolbar } from "@/components/whs/safety-ui";
import { useListState } from "@/lib/use-list-state";

export const Route = createFileRoute("/_auth/safety/medical-centres/")({
  component: MedicalCentres,
});

const ALL = "all";

/**
 * Med1 Medical Centres: the list the installer app shows nearest first
 * (framework 3, 4A; decisions D4, D13). Real data: one row per practice, with
 * every suburb that lists it.
 */
function MedicalCentres() {
  const centres = useQuery(api.medicalCentres.list);
  const list = useListState();
  const query = list.get("q", "");
  const setQuery = (value: string) => list.set("q", value);
  const suburb = list.get("suburb", ALL);
  const setSuburb = (value: string) => list.set("suburb", value);
  const suburbs = [...new Set((centres ?? []).flatMap((centre) => centre.suburbs))].sort();
  const needle = query.trim().toLowerCase();
  const rows = (centres ?? []).filter(
    (centre) =>
      (needle === "" || `${centre.name} ${centre.address} ${centre.suburbs.join(" ")}`.toLowerCase().includes(needle)) &&
      (suburb === ALL || centre.suburbs.includes(suburb)),
  );

  return (
    <SafetyPage title="Medical Centres" description="Maintain the centre directory published to the installer app.">
      <Panel>
        <Toolbar>
          <div className="w-full sm:flex-1">
            <SearchBox value={query} onChange={setQuery} placeholder="Search medical centres by name, suburb" />
          </div>
          <FilterSelect label="Suburb" value={suburb} onChange={setSuburb} options={[{ value: ALL, label: "All" }, ...suburbs.map((value) => ({ value, label: value }))]} />
          <SafetyButton to="/safety/medical-centres/import" className="h-[38px]">
            + Import Centres
          </SafetyButton>
        </Toolbar>
        <PagedTable
          page={list.page}
            onPage={list.setPage}
          noun="centres"
          rows={rows}
          rowKey={(row) => row.id}
          empty={centres === undefined ? "Loading…" : "No medical centres match."}
          columns={[
            {
              key: "centre",
              header: "Centre / address",
              render: (row) => (
                <div className="flex flex-col">
                  <span className="text-[13px] text-[#111827]">{row.name}</span>
                  <span className="text-[11px] font-normal text-[#64748b]">{row.address}</span>
                </div>
              ),
            },
            {
              key: "hours",
              header: "Opening hours",
              render: (row) => (
                <div className="flex flex-col py-2 text-xs font-normal text-[#374151]">
                  <span>Mon–Fri: {row.hours_weekdays}</span>
                  <span>Sat: {row.hours_saturday}</span>
                  <span>Sun: {row.hours_sunday}</span>
                </div>
              ),
            },
            { key: "phone", header: "Phone", render: (row) => <span className="text-[13px] text-[#111827]">{row.phone}</span> },
            { key: "suburbs", header: "Listed suburbs", render: (row) => <span className="text-[13px]">{row.suburbs.join(", ")}</span> },
            { key: "gps", header: "GPS coordinates", render: (row) => <span className="text-xs">{row.latitude.toFixed(5)}, {row.longitude.toFixed(5)}</span> },
          ]}
        />
      </Panel>
    </SafetyPage>
  );
}
