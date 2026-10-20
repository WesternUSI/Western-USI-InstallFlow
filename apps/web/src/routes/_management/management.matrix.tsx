import { Link, createFileRoute } from "@tanstack/react-router";

import { FilterSelect } from "@/components/filter-select";
import { MgmtPage, NEEDS_ACTION, mgmtRecordRoute } from "@/components/whs/management";
import { AccreditationViewSwitch, Notice, PagedTable, Panel, RowAction, SearchBox, StatusBadge, Toolbar } from "@/components/whs/safety-ui";
import { useListState } from "@/lib/use-list-state";
import { type RegisterRow, toVerify, useRegister } from "@/lib/use-register";

export const Route = createFileRoute("/_management/management/matrix")({
  validateSearch: (search: Record<string, unknown>): { q?: string; entity?: string; status?: string } => ({
    q: typeof search.q === "string" && search.q !== "" ? search.q : undefined,
    entity: typeof search.entity === "string" && search.entity !== "" ? search.entity : undefined,
    status: typeof search.status === "string" && search.status !== "" ? search.status : undefined,
  }),
  component: AccreditationMatrix,
});

const STATUSES = [
  { value: "all", label: "All statuses" },
  { value: "needs-action", label: "Needs action" },
  { value: "to-verify", label: "Awaiting verification" },
  { value: "current", label: "All current" },
];

/**
 * M5 Accreditation Matrix (decision AD43): every worker against every
 * accreditation they hold or must hold. Each status opens its record; a
 * worker with evidence waiting goes straight to the review.
 */
function AccreditationMatrix() {
  const search = Route.useSearch();
  const list = useListState();
  const register = useRegister();
  const rows = (register?.rows ?? []).filter((row) => row.category === "accreditation" && row.worker_id);

  const workers = [...new Set(rows.map((row) => row.worker_id as string))].map((workerId) => {
    const own = rows.filter((row) => row.worker_id === workerId);
    return { workerId, name: own[0]?.person ?? "Worker", entity: own[0]?.entity ?? "", own };
  });
  const needle = (search.q ?? "").trim().toLowerCase();
  const status = search.status ?? "all";
  const shown = workers
    .filter(
      (worker) =>
        (needle === "" || worker.name.toLowerCase().includes(needle)) &&
        (!search.entity || worker.entity === search.entity) &&
        (status === "all" ||
          (status === "needs-action" && worker.own.some((row) => NEEDS_ACTION.includes(row.status))) ||
          (status === "to-verify" && worker.own.some(toVerify)) ||
          (status === "current" && worker.own.every((row) => row.status === "current" || row.status === "due-soon"))),
    )
    .sort((a, b) => a.entity.localeCompare(b.entity) || a.name.localeCompare(b.name));
  const types = [...new Set(shown.flatMap((worker) => worker.own.map((row) => row.name)))].sort();

  const cell = (row: RegisterRow | undefined) => {
    if (row === undefined) return <span className="text-[13px] text-[#64748b]">Not required</span>;
    const route = mgmtRecordRoute(row);
    return (
      <Link to={route.to as never} params={route.params as never} className="inline-flex hover:opacity-80" title={`Open ${row.name}`}>
        <StatusBadge status={row.status} label={row.label} />
      </Link>
    );
  };

  return (
    <MgmtPage title="Worker Accreditations" description="Management · Compare worker requirements across entities">
      <AccreditationViewSwitch active="matrix" management />
      <Notice tone="info">Select a status to open its record. Not required means that accreditation isn't required for that worker.</Notice>
      <Panel>
        <Toolbar>
          <div className="w-full sm:flex-1">
            <SearchBox value={search.q ?? ""} onChange={(value) => list.set("q", value)} placeholder="Search workers" />
          </div>
          <FilterSelect
            label="Entity"
            value={search.entity ?? "all"}
            options={[{ value: "all", label: "All entities" }, ...(register?.entities ?? []).map((name) => ({ value: name, label: name }))]}
            onChange={(value) => list.set("entity", value)}
          />
          <FilterSelect label="Status" value={status} options={STATUSES} onChange={(value) => list.set("status", value)} />
        </Toolbar>
        <PagedTable
          rows={shown}
          rowKey={(row) => row.workerId}
          empty={register === undefined ? "Loading…" : "No workers match."}
          columns={[
            {
              key: "worker",
              header: "Worker / entity",
              render: (row) => (
                <div className="flex flex-col">
                  <span className="text-[13px] text-[#111827]">{row.name}</span>
                  <span className="text-[11px] font-normal text-[#64748b]">{row.entity}</span>
                </div>
              ),
            },
            ...types.map((type) => ({
              key: `type:${type}`,
              header: type,
              render: (row: (typeof shown)[number]) => cell(row.own.find((entry) => entry.name === type)),
            })),
            {
              key: "action",
              header: "Action",
              align: "right" as const,
              render: (row) => {
                const waiting = row.own.find(toVerify);
                if (waiting) {
                  const route = mgmtRecordRoute(waiting);
                  return (
                    <RowAction to={route.to as never} params={route.params}>
                      Review evidence
                    </RowAction>
                  );
                }
                return (
                  <RowAction to="/management/workers/$workerId" params={{ workerId: row.workerId }}>
                    View worker
                  </RowAction>
                );
              },
            },
          ]}
        />
      </Panel>
      <p className="text-xs text-[#64748b]">Missing and expired evidence must be resolved before the relevant work is allocated.</p>
    </MgmtPage>
  );
}
