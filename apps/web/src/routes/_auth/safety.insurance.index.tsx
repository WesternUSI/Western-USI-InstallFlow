import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { FilterSelect } from "@/components/filter-select";
import { PagedTable, Panel, RowAction, SafetyButton, SafetyPage, SearchBox, StatusBadge, Toolbar } from "@/components/whs/safety-ui";
import { formatIsoDate } from "@/lib/upload-file";
import { useListState } from "@/lib/use-list-state";

export const Route = createFileRoute("/_auth/safety/insurance/")({
  component: InsuranceRegister,
});

const ALL = "all";

/** Insurance Register (framework 4C), real data: Western USI's and subcontractors' policies. */
function InsuranceRegister() {
  const policies = useQuery(api.insurance.list);
  const list = useListState();
  const query = list.get("q", "");
  const setQuery = (value: string) => list.set("q", value);
  const entity = list.get("entity", ALL);
  const setEntity = (value: string) => list.set("entity", value);
  const entities = [...new Set((policies ?? []).map((policy) => policy.entity))].sort();
  const needle = query.trim().toLowerCase();
  const rows = (policies ?? []).filter(
    (policy) =>
      (needle === "" || `${policy.type} ${policy.insurer} ${policy.entity}`.toLowerCase().includes(needle)) &&
      (entity === ALL || policy.entity === entity),
  );

  return (
    <SafetyPage title="Insurance Register" description="Policies and certificates of currency for Western USI and its subcontractors.">
      <Panel>
        <Toolbar>
          <div className="w-full sm:flex-1">
            <SearchBox value={query} onChange={setQuery} placeholder="Search policy, insurer, entity" />
          </div>
          <FilterSelect label="Entity" value={entity} onChange={setEntity} options={[{ value: ALL, label: "All" }, ...entities.map((value) => ({ value, label: value }))]} />
          <SafetyButton to="/safety/records/new/insurance" className="h-[38px]">
            + Add Policy
          </SafetyButton>
        </Toolbar>
        <PagedTable
          page={list.page}
            onPage={list.setPage}
          noun="policies"
          rows={rows}
          rowKey={(row) => row.id}
          empty={policies === undefined ? "Loading…" : "No policies yet. Add one to start the register."}
          columns={[
            { key: "policy", header: "Policy", render: (row) => <span className="text-[#111827]">{row.type}</span> },
            { key: "entity", header: "Insured entity", render: (row) => row.entity },
            { key: "insurer", header: "Insurer / coverage", render: (row) => `${row.insurer} · ${row.coverage}` },
            { key: "expires", header: "Expiry", render: (row) => formatIsoDate(row.expires) },
            { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
            {
              key: "actions",
              header: "Actions",
              align: "right",
              render: (row) =>
                row.status === "awaiting-verification" || row.status === "renewal-in-progress" ? (
                  <RowAction to="/safety/insurance/$policyId/verify" params={{ policyId: row.id }}>Verify</RowAction>
                ) : row.status === "expired" || row.status === "due-soon" ? (
                  <RowAction to="/safety/insurance/$policyId/renew" params={{ policyId: row.id }}>Renew</RowAction>
                ) : (
                  <RowAction to="/safety/insurance/$policyId" params={{ policyId: row.id }}>Open</RowAction>
                ),
            },
          ]}
        />
      </Panel>
    </SafetyPage>
  );
}
