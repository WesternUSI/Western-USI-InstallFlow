import { api } from "@usi-installer/backend/convex/_generated/api";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { Notice, PagedTable, Panel, RowAction, StatusBadge } from "@/components/whs/safety-ui";
import { SubPage, uploadAction } from "@/components/whs/subcontractor-portal";
import { formatIsoDate } from "@/lib/upload-file";

export const Route = createFileRoute("/_subcontractor/subcontractor/workers/$workerId")({
  component: WorkerAccreditations,
});

/** S8 One of the company's workers and their accreditations (framework 4B); each opens its record. */
function WorkerAccreditations() {
  const { workerId } = Route.useParams();
  const data = useQuery(api.subcontractorPortal.worker, { worker_id: workerId });
  const back = { to: "/subcontractor/workers", label: "Our Workers" };

  if (data === undefined || data === null) {
    return (
      <SubPage title="Worker" back={back}>
        <Panel className="p-6 text-sm text-[#64748b]">{data === undefined ? "Loading…" : "This worker could not be found."}</Panel>
      </SubPage>
    );
  }
  const attention = data.items.filter((item) => item.needs_attention);

  return (
    <SubPage title={`${data.worker} · Accreditations`} back={back}>
      {attention.length > 0 ? (
        <Notice tone="warning">
          {attention.map((item) => item.name).join(", ")} {attention.length === 1 ? "needs" : "need"} new evidence.
        </Notice>
      ) : (
        <Notice tone="success">Every accreditation {data.worker} must hold is in order.</Notice>
      )}
      <Panel>
        <PagedTable
          rows={data.items}
          rowKey={(row) => row.key}
          empty="No accreditations required yet."
          columns={[
            {
              key: "name",
              header: "Credential",
              render: (row) => (
                <Link
                  to="/subcontractor/accreditations/$key"
                  params={{ key: row.key }}
                  className="font-medium text-[#111827] hover:text-[#2563eb] hover:underline"
                >
                  {row.name}
                </Link>
              ),
            },
            { key: "number", header: "Number", render: (row) => row.number ?? "—" },
            { key: "expiry", header: "Expiry", render: (row) => (!row.has_evidence ? "—" : row.no_expiry ? "No expiry" : formatIsoDate(row.expires)) },
            { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
            {
              key: "action",
              header: "Action",
              align: "right",
              render: (row) =>
                uploadAction(row.status) === "Upload evidence" ? (
                  <RowAction to="/subcontractor/accreditations/$key/upload" params={{ key: row.key }}>
                    Upload evidence
                  </RowAction>
                ) : (
                  <RowAction to="/subcontractor/accreditations/$key" params={{ key: row.key }}>
                    View record
                  </RowAction>
                ),
            },
          ]}
        />
      </Panel>
    </SubPage>
  );
}
