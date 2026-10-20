import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { FilterSelect } from "@/components/filter-select";
import { MgmtPage, entityNeedsAction, mgmtEntityParams, worstStatus } from "@/components/whs/management";
import { PagedTable, Panel, RowAction, SearchBox, StatusBadge, Toolbar, type SafetyStatus } from "@/components/whs/safety-ui";
import { useListState } from "@/lib/use-list-state";
import { useRegister } from "@/lib/use-register";

export const Route = createFileRoute("/_management/management/entities/")({
  validateSearch: (search: Record<string, unknown>): { q?: string; page?: string; status?: string } => ({
    q: typeof search.q === "string" && search.q !== "" ? search.q : undefined,
    page: typeof search.page === "string" && search.page !== "" ? search.page : undefined,
    status: typeof search.status === "string" && search.status !== "" ? search.status : undefined,
  }),
  component: Entities,
});

/**
 * M3 Subcontractor Compliance, as "Entities" like the admin side (decision
 * AD43): Western USI and every subcontractor, one overall status each. Read-only.
 */
function Entities() {
  const search = Route.useSearch();
  const list = useListState();
  const register = useRegister();
  const subcontractors = useQuery(api.subcontractors.list);
  const agreements = useQuery(api.agreements.statuses);
  const rows = register?.rows ?? [];

  const entities = [
    { key: "western-usi", name: "Western USI", contact: "The company itself", subcontractorId: undefined as string | undefined },
    ...(subcontractors ?? []).map((row) => ({
      key: row._id as string,
      name: row.name,
      contact: row.contact_name ?? "No contact recorded",
      subcontractorId: row._id as string | undefined,
    })),
  ].map((entity) => {
    const own = rows.filter((row) => row.entity === entity.name);
    const accreditations = own.filter((row) => row.category === "accreditation");
    return {
      ...entity,
      workers: new Set(accreditations.map((row) => row.worker_id)).size,
      insurance: worstStatus(own.filter((row) => row.category === "insurance").map((row) => row.status)),
      workerCompliance: worstStatus(accreditations.map((row) => row.status)),
      needsAction: entityNeedsAction(rows, entity.name, entity.subcontractorId, agreements),
    };
  });
  const needle = (search.q ?? "").trim().toLowerCase();
  const shown = entities.filter(
    (entity) =>
      (needle === "" || `${entity.name} ${entity.contact}`.toLowerCase().includes(needle)) &&
      (!search.status || (search.status === "action-required" ? entity.needsAction : !entity.needsAction)),
  );

  return (
    <MgmtPage title="Entities">
      <Panel>
        <Toolbar>
          <div className="w-full sm:flex-1">
            <SearchBox value={search.q ?? ""} onChange={(value) => list.set("q", value)} placeholder="Search business or contact" />
          </div>
          <FilterSelect
            label="Status"
            value={search.status ?? "all"}
            options={[
              { value: "all", label: "All statuses" },
              { value: "action-required", label: "Action required" },
              { value: "compliant", label: "Compliant" },
            ]}
            onChange={(value) => list.set("status", value)}
          />
        </Toolbar>
        <PagedTable
          page={list.page}
          onPage={list.setPage}
          noun="entities"
          rows={shown}
          rowKey={(row) => row.key}
          empty={subcontractors === undefined || register === undefined ? "Loading…" : "No entities match."}
          columns={[
            {
              key: "company",
              header: "Company / contact",
              render: (row) => (
                <div className="flex flex-col">
                  <span className="text-[13px] text-[#111827]">{row.name}</span>
                  <span className="text-[11px] font-normal text-[#64748b]">{row.contact}</span>
                </div>
              ),
            },
            { key: "workers", header: "Workers", render: (row) => row.workers },
            {
              key: "insurance",
              header: "Business insurance",
              render: (row) => (row.insurance ? <StatusBadge status={row.insurance as SafetyStatus} /> : <span className="text-[13px] text-[#64748b]">No policies</span>),
            },
            {
              key: "workerCompliance",
              header: "Worker compliance",
              render: (row) =>
                row.workerCompliance ? <StatusBadge status={row.workerCompliance as SafetyStatus} /> : <span className="text-[13px] text-[#64748b]">No workers</span>,
            },
            {
              key: "overall",
              header: "Overall",
              render: (row) => (row.needsAction ? <StatusBadge status="action-required" /> : <StatusBadge status="current" label="Compliant" />),
            },
            {
              key: "action",
              header: "Action",
              align: "right",
              render: (row) => (
                <RowAction to="/management/entities/$entityId" params={mgmtEntityParams(row.subcontractorId)}>
                  View entity
                </RowAction>
              ),
            },
          ]}
        />
      </Panel>
      <p className="text-xs text-[#64748b]">Company insurance and worker credentials are reviewed separately. Account changes are managed by an administrator.</p>
    </MgmtPage>
  );
}
