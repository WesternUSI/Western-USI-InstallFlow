import { api } from "@usi-installer/backend/convex/_generated/api";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { Notice, PagedTable, Panel, RowAction, SearchBox, Toolbar } from "@/components/whs/safety-ui";
import { SubPage } from "@/components/whs/subcontractor-portal";
import { useListState } from "@/lib/use-list-state";

export const Route = createFileRoute("/_subcontractor/subcontractor/workers/")({
  component: OurWorkers,
});

/** "RIW Card expired; First Aid missing", for the Action needed column. */
function attentionText(attention: { name: string; status: string }[]): string {
  if (attention.length === 0) return "Nothing";
  const words: Record<string, string> = {
    expired: "expired",
    overdue: "overdue",
    missing: "missing",
    "action-required": "new evidence requested",
    "due-soon": "due soon",
  };
  return attention.map((item) => `${item.name} ${words[item.status] ?? "needs attention"}`).join("; ");
}

/**
 * S7 Our Workers (framework 4D: accreditations belong to individual
 * workers): only this company's workers, with the SWMS each still has to sign
 * (4D "SWMS acknowledgements"; Our Compliance's SWMS card opens this list
 * showing only them). The Figma's status filter is left out; search is
 * enough for one company's list. Search and page stay in the address, so
 * Back returns to the same view.
 */
function OurWorkers() {
  const workers = useQuery(api.subcontractorPortal.workers);
  const company = useQuery(api.subcontractorPortal.company);
  const list = useListState();
  const search = list.get("q");
  const onlySwms = list.get("swms") === "to-sign";
  const needle = search.trim().toLowerCase();
  const rows = (workers ?? []).filter(
    (row) => (needle === "" || row.name.toLowerCase().includes(needle)) && (!onlySwms || row.swms_to_sign > 0),
  );

  return (
    <SubPage title="Our Workers" back={{ to: "/subcontractor", label: "Our Compliance" }}>
      {onlySwms ? (
        <Notice tone="info">
          Showing workers who still have SWMS to sign. Each worker signs personally in the InstallFlow app.{" "}
          <Link to="/subcontractor/workers" className="font-semibold text-[#2563eb] hover:underline">
            Show all workers
          </Link>
        </Notice>
      ) : null}
      <Panel>
        <Toolbar>
          <SearchBox value={search} onChange={(value) => list.set("q", value)} placeholder="Search workers" />
        </Toolbar>
        <PagedTable
          noun="workers"
          page={list.page}
          onPage={list.setPage}
          rows={rows}
          rowKey={(row) => row.id}
          empty={
            workers === undefined
              ? "Loading…"
              : needle
                ? "No workers match your search."
                : onlySwms
                  ? "Every worker has signed the current SWMS."
                  : "No workers yet. Western USI adds them."
          }
          columns={[
            {
              key: "worker",
              header: "Worker",
              render: (row) => (
                <Link
                  to="/subcontractor/workers/$workerId"
                  params={{ workerId: row.id }}
                  className="font-medium text-[#111827] hover:text-[#2563eb] hover:underline"
                >
                  {row.name}
                </Link>
              ),
            },
            { key: "credentials", header: "Credentials", render: (row) => (row.held.length === 0 ? "None uploaded" : row.held.join(" · ")) },
            { key: "attention", header: "Action needed", render: (row) => attentionText(row.attention) },
            { key: "swms", header: "SWMS to sign", render: (row) => (row.swms_to_sign === 0 ? "None" : row.swms_to_sign) },
            {
              key: "action",
              header: "Action",
              align: "right",
              render: (row) => (
                <RowAction to="/subcontractor/workers/$workerId" params={{ workerId: row.id }}>
                  View worker
                </RowAction>
              ),
            },
          ]}
        />
      </Panel>
      <Notice tone="info">
        This list contains only workers linked to {company?.name ?? "your company"}. Contact Western USI to add or remove a worker.
        {company?.is_worker ? " You're set up as a sole trader, one of your own workers, so you hold your own accreditations too. Western USI can change this." : ""}
      </Notice>
    </SubPage>
  );
}
