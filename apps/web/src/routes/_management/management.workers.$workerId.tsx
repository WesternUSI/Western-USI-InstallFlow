import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { MgmtPage } from "@/components/whs/management";
import { Notice, PagedTable, Panel, RowAction, StatusBadge } from "@/components/whs/safety-ui";
import { formatIsoDate } from "@/lib/upload-file";

export const Route = createFileRoute("/_management/management/workers/$workerId")({
  component: WorkerAccreditations,
});

/** M6 One worker's accreditations for management (decision AD43). Read-only; each opens its record. */
function WorkerAccreditations() {
  const { workerId } = Route.useParams();
  const data = useQuery(api.accreditations.forWorker, { worker_id: workerId });
  const back = { to: "/management/accreditations", label: "Worker Accreditations" };

  if (data === undefined || data === null) {
    return (
      <MgmtPage title="Worker" back={back}>
        <Panel className="p-6 text-sm text-[#64748b]">{data === undefined ? "Loading…" : "This worker could not be found."}</Panel>
      </MgmtPage>
    );
  }
  const attention = data.items.filter((item) => item.needs_attention);

  return (
    <MgmtPage title={`${data.worker} · Accreditations`} description={`Management · ${data.entity}`} back={back}>
      {attention.length > 0 ? (
        <Notice tone="warning">
          {attention.map((item) => item.name).join(", ")} {attention.length === 1 ? "needs" : "need"} attention. Work eligibility is reviewed through the
          existing allocation controls.
        </Notice>
      ) : (
        <Notice tone="success">Every accreditation {data.worker} holds is current.</Notice>
      )}
      <Panel>
        <PagedTable
          rows={data.items}
          rowKey={(row) => row.key}
          empty="No accreditations required yet."
          columns={[
            { key: "name", header: "Credential", render: (row) => <span className="text-[#111827]">{row.name}</span> },
            { key: "number", header: "Card / licence", render: (row) => row.number ?? "—" },
            { key: "expiry", header: "Expiry", render: (row) => (!row.has_evidence ? "—" : row.no_expiry ? "No expiry" : formatIsoDate(row.expires)) },
            { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
            {
              key: "action",
              header: "Action",
              align: "right",
              render: (row) => (
                <RowAction to="/management/accreditations/$key" params={{ key: row.key }}>
                  {row.status === "awaiting-verification" || row.status === "renewal-in-progress" ? "Review" : "Open"}
                </RowAction>
              ),
            },
          ]}
        />
      </Panel>
    </MgmtPage>
  );
}
