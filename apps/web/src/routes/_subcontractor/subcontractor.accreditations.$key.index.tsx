import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { ACTIVITY_TEXT, ActivityPanel, ReminderScheduleCard } from "@/components/whs/management";
import { DetailsLayout, EvidencePreview, SideButton, SideCard } from "@/components/whs/record-cards";
import { DetailGrid, Notice, Panel, StatusBadge, reminderText } from "@/components/whs/safety-ui";
import { SubPage, uploadAction } from "@/components/whs/subcontractor-portal";
import { formatIsoDate } from "@/lib/upload-file";

export const Route = createFileRoute("/_subcontractor/subcontractor/accreditations/$key/")({
  component: WorkerAccreditation,
});

/**
 * S9 / S28 One worker's accreditation (framework 4B): the evidence on file,
 * Western USI's request when it asked for new evidence, and the upload the
 * status calls for. Read-only otherwise; the contact never verifies.
 */
function WorkerAccreditation() {
  const { key } = Route.useParams();
  const detail = useQuery(api.subcontractorPortal.accreditation, { key });
  const navigate = useNavigate();
  const back = { to: "/subcontractor/workers", label: "Our Workers" };

  if (detail === undefined || detail === null) {
    return (
      <SubPage title="Accreditation" back={back}>
        <Panel className="p-6 text-sm text-[#64748b]">{detail === undefined ? "Loading…" : "This accreditation could not be found."}</Panel>
      </SubPage>
    );
  }
  const evidence = detail.evidence;
  const waiting = detail.pending_version_id !== undefined;
  const action = waiting ? undefined : uploadAction(detail.status);
  const workerBack = { to: "/subcontractor/workers/$workerId", label: "Worker accreditations", params: { workerId: detail.worker_id } };

  return (
    <SubPage title={`${detail.type} · ${detail.worker}`} back={workerBack}>
      {evidence?.rejected_reason ? <Notice tone="danger">Western USI asked for new evidence: {evidence.rejected_reason}</Notice> : null}
      {waiting ? <Notice tone="info">The evidence is waiting for Western USI to check it. Nothing else is needed from you.</Notice> : null}
      <DetailsLayout
        main={
          <>
            <Panel className="flex flex-col gap-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold text-[#111827]">{`${detail.type} · ${detail.worker}`}</h2>
                <StatusBadge status={detail.status} />
              </div>
              <DetailGrid
                columns={2}
                items={[
                  { label: "Worker", value: detail.worker },
                  { label: "Business", value: detail.entity },
                  { label: "Card or licence number", value: evidence?.number ?? "—" },
                  { label: "Expiry", value: evidence === null ? "—" : evidence.no_expiry ? "No expiry" : formatIsoDate(evidence.expires) },
                ]}
              />
            </Panel>
            {action ? (
              <Panel className="flex flex-col gap-2 p-6">
                <h3 className="text-base font-semibold text-[#111827]">{detail.status === "missing" ? "Evidence needed" : "Replacement evidence"}</h3>
                <p className="text-[13px] text-[#64748b]">
                  Supply a clear copy of the card or certificate showing {detail.worker}'s name. Western USI checks it and records the confirmed expiry.
                </p>
              </Panel>
            ) : null}
            <ActivityPanel
              lines={detail.activity.map((entry) => ({ at: entry.at, text: ACTIVITY_TEXT[entry.action] ?? entry.action, by: entry.by, details: entry.details }))}
            />
          </>
        }
        side={
          <>
            <SideCard title="Evidence">
              <EvidencePreview fileName={evidence?.file_name ?? "No evidence yet"} />
              {evidence?.url ? <SideButton onClick={() => window.open(evidence.url ?? "", "_blank", "noopener")}>Open Evidence</SideButton> : null}
              {action ? (
                <SideButton filled onClick={() => void navigate({ to: "/subcontractor/accreditations/$key/upload", params: { key } })}>
                  {action === "Replace evidence" ? "Replace Evidence" : action === "Upload renewal" ? "Upload Renewal" : "Upload Evidence"}
                </SideButton>
              ) : null}
            </SideCard>
            <ReminderScheduleCard text={reminderText(detail.reminder_days, "expiry")} />
          </>
        }
      />
    </SubPage>
  );
}
