import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { AddSubcontractorForm } from "@/components/add-subcontractor-form";
import { PagedTable, Panel, RowAction, SafetyPage, SearchBox, StatCard, Toolbar } from "@/components/whs/safety-ui";
import { WESTERN_USI_ID } from "@/components/whs/subcontractor-header";
import { useListState } from "@/lib/use-list-state";

export const Route = createFileRoute("/_auth/safety/subcontractors/")({
  component: SubcontractorsScreen,
});

/**
 * SC01 Subcontractors: the real list and the existing "Add Subcontractor" form
 * (framework 4D). The Figma's team filter is left out: subcontractors have no
 * teams (decision A2). Compliance status per business comes with the wiring.
 */
function SubcontractorsScreen() {
  const subcontractors = useQuery(api.subcontractors.list);
  const list = useListState();
  const query = list.get("q", "");
  const setQuery = (value: string) => list.set("q", value);
  const needle = query.trim().toLowerCase();
  // Western USI is an entity too (decision R4), listed first.
  const entities = [
    { _id: WESTERN_USI_ID, name: "Western USI", abn: undefined as string | undefined, contact_name: undefined as string | undefined },
    ...(subcontractors ?? []),
  ];
  const rows = entities.filter((row) => needle === "" || `${row.name} ${row.abn ?? ""}`.toLowerCase().includes(needle));

  return (
    <SafetyPage title="Subcontractors" description="Subcontractor businesses, their workers and their compliance.">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total businesses" value={subcontractors?.length ?? "—"} hint="Subcontractor businesses on record" />
        <StatCard label="Workers" value={56} hint="Total onboarded workers" tone="green" />
        <StatCard label="Solo contractors" value={1} hint="Sole traders" tone="red" />
      </div>
      <AddSubcontractorForm />
      <Panel>
        <Toolbar>
          <div className="w-full sm:flex-1">
            <SearchBox value={query} onChange={setQuery} placeholder="Search by company name or ABN" />
          </div>
        </Toolbar>
        <PagedTable
          page={list.page}
            onPage={list.setPage}
          noun="businesses"
          rows={rows}
          rowKey={(row) => row._id}
          empty={subcontractors === undefined ? "Loading…" : "No subcontractors match."}
          columns={[
            {
              key: "company",
              header: "Company",
              render: (row) => (
                <div className="flex flex-col">
                  <span className="text-[#111827]">{row.name}</span>
                  {row._id === WESTERN_USI_ID ? <span className="text-[11px] font-normal text-[#64748b]">The company itself</span> : null}
                </div>
              ),
            },
            { key: "abn", header: "ABN", render: (row) => row.abn ?? "—" },
            { key: "contact", header: "Primary contact", render: (row) => row.contact_name ?? "—" },
            {
              key: "actions",
              header: "Actions",
              align: "right",
              render: (row) => (
                <RowAction to="/safety/subcontractors/$subcontractorId" params={{ subcontractorId: row._id }}>
                  View Details
                </RowAction>
              ),
            },
          ]}
        />
      </Panel>
    </SafetyPage>
  );
}
