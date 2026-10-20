import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { DetailGrid, Notice, PagedTable, Panel, RowAction, SafetyPage, StatusBadge } from "@/components/whs/safety-ui";
import { useSubcontractor } from "@/components/whs/subcontractor-header";
import { formatIsoDate, formatTime } from "@/lib/upload-file";

export const Route = createFileRoute("/_auth/safety/subcontractors/$subcontractorId/swms")({
  validateSearch: (search: Record<string, unknown>): { document?: string } => ({
    document: typeof search.document === "string" && search.document !== "" ? search.document : undefined,
  }),
  component: SwmsAcknowledgements,
});

/**
 * SC12 SWMS Acknowledgements, real (framework 4D "SWMS acknowledgements"):
 * this entity's installers against the current version of one SWMS (D9).
 */
function SwmsAcknowledgements() {
  const { subcontractorId } = Route.useParams();
  const { document: documentId } = Route.useSearch();
  const { subcontractor } = useSubcontractor(subcontractorId);
  const all = useQuery(api.whsReports.swmsAcknowledgements);
  const rows = (all ?? []).filter((row) => row.document_id === documentId && row.entity === subcontractor?.name);
  const first = rows[0];
  const signed = rows.filter((row) => row.signed_at !== undefined).length;
  const back = { to: "/safety/subcontractors/$subcontractorId" as const, label: "Documents", params: { subcontractorId }, search: { tab: "documents" as const } };

  if (all === undefined || subcontractor === undefined) {
    return (
      <SafetyPage title="SWMS Acknowledgements" description="" back={back}>
        <Panel className="p-6 text-sm text-[#64748b]">Loading…</Panel>
      </SafetyPage>
    );
  }

  return (
    <SafetyPage title="SWMS Acknowledgements" description={subcontractor.name} back={back}>
      {first === undefined ? (
        <Panel className="p-6 text-sm text-[#64748b]">{subcontractor.name} has no installers who need to sign this SWMS.</Panel>
      ) : (
        <>
          <Panel className="flex flex-wrap items-start justify-between gap-4 p-5">
            <DetailGrid
              columns={4}
              items={[
                { label: "Document", value: first.document },
                { label: "Current version", value: first.version },
                { label: "Issued", value: formatIsoDate(first.issued) },
                { label: "Signed", value: `${signed} of ${rows.length}` },
              ]}
            />
            <RowAction to="/safety/documents/$documentId" params={{ documentId: first.document_id }}>
              Open document
            </RowAction>
          </Panel>
          <Notice tone="info">Each installer signs the current version in the app. Reminders go out automatically until they do.</Notice>
          <Panel>
            <PagedTable
              rows={rows}
              rowKey={(row) => row.worker}
              columns={[
                { key: "worker", header: "Installer", render: (row) => <span className="text-[#111827]">{row.worker}</span> },
                {
                  key: "ack",
                  header: "Acknowledgement",
                  render: (row) => (
                    <StatusBadge status={row.signed_at === undefined ? "action-required" : "current"} label={row.signed_at === undefined ? "Not signed yet" : "Signed"} />
                  ),
                },
                { key: "when", header: "Signed on", render: (row) => (row.signed_at === undefined ? "—" : formatTime(row.signed_at)) },
              ]}
            />
          </Panel>
        </>
      )}
    </SafetyPage>
  );
}
