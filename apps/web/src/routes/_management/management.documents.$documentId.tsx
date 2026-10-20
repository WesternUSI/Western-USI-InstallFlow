import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { cn } from "@usi-installer/ui/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { ActivityPanel, MgmtPage, ReminderScheduleCard } from "@/components/whs/management";
import { ReasonDialog } from "@/components/whs/reason-dialog";
import { DetailsLayout, EvidencePreview, SideButton, SideCard } from "@/components/whs/record-cards";
import { DetailGrid, Notice, PagedTable, Panel, reminderText, SafetyButton, StatusBadge } from "@/components/whs/safety-ui";
import { documentTypeLabel, reviewReminderDays } from "@/lib/document-kinds";
import { toUserMessage } from "@/lib/errors";
import { formatIsoDate, formatTime } from "@/lib/upload-file";
import { useRegister } from "@/lib/use-register";

export const Route = createFileRoute("/_management/management/documents/$documentId")({
  component: DocumentForManagement,
});

const CHANGE_STATE: Record<string, { label: string; className: string }> = {
  "awaiting-review": { label: "Awaiting review", className: "bg-[#fcfcdc] text-[#bb7e23]" },
  validated: { label: "Validated", className: "bg-[#dcfce7] text-[#166534]" },
  "sent-back": { label: "Sent back", className: "bg-[#fcdcdd] text-[#b71d1f]" },
};

/**
 * M18 A safety document for management (framework 4A, decisions D3, AD43):
 * who has signed the current version, and on-site SWMS changes, which
 * management can validate or send back. Everything else is read-only.
 */
function DocumentForManagement() {
  const { documentId } = Route.useParams();
  const doc = useQuery(api.documents.adminDetail, { document_id: documentId });
  const register = useRegister();
  const row = register?.rows.find((entry) => entry.id === documentId);
  const validate = useMutation(api.documents.validateChange);
  const sendBack = useMutation(api.documents.sendBackChange);
  const [sendingBack, setSendingBack] = useState<Id<"swms_changes"> | null>(null);
  const back = { to: "/management/exceptions", label: "Exceptions" };

  if (doc === undefined || doc === null) {
    return (
      <MgmtPage title="Document" back={back}>
        <Panel className="p-6 text-sm text-[#64748b]">{doc === undefined ? "Loading…" : "This document could not be found."}</Panel>
      </MgmtPage>
    );
  }
  const signed = doc.acknowledgements.filter((ack) => ack.acknowledged_at !== undefined).length;
  const type = documentTypeLabel(doc.kind, doc.category);

  const handleValidate = async (id: Id<"swms_changes">) => {
    try {
      await validate({ change_id: id });
      toast.success("On-site change validated");
    } catch (error) {
      toast.error(toUserMessage(error, "Could not validate that change."));
    }
  };
  const handleSendBack = async (reason: string) => {
    if (sendingBack === null) return;
    try {
      await sendBack({ change_id: sendingBack, reason });
      toast.success("Change sent back", { description: "The worker who recorded it has been emailed." });
    } catch (error) {
      toast.error(toUserMessage(error, "Could not send that change back."));
      throw error;
    }
  };

  return (
    <MgmtPage title={doc.title} description={`Management · ${[doc.code, type].filter(Boolean).join(" · ")}`} back={back}>
      <ReasonDialog
        open={sendingBack !== null}
        title="Send this change back"
        description="The worker who recorded it is emailed with your reason, and the change shows as Sent back."
        placeholder="e.g. The control doesn't address the traffic risk; brief the crew on a spotter and record it again."
        confirmLabel="Send Back"
        missingMessage="Enter a reason, so the worker knows what to change."
        onClose={() => setSendingBack(null)}
        onConfirm={handleSendBack}
      />
      {doc.archived ? <Notice tone="warning">This document is archived. It is kept with its history but no longer used.</Notice> : null}
      <DetailsLayout
        main={
          <>
            <Panel className="flex flex-col gap-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold text-[#111827]">Document details</h2>
                {row ? <StatusBadge status={row.status} label={row.label} /> : null}
              </div>
              <DetailGrid
                columns={2}
                items={[
                  { label: "Version", value: doc.current?.version ?? "—" },
                  { label: "Type", value: type },
                  { label: "Who must read and sign", value: doc.for_text },
                  { label: "Issue date", value: formatIsoDate(doc.current?.issued) },
                  { label: "Review date", value: formatIsoDate(doc.current?.review_date) },
                  { label: "Responsible person", value: doc.responsible ?? "The admin list" },
                ]}
              />
            </Panel>

            {doc.acknowledgement_required ? (
              <Panel>
                <div className="flex items-center justify-between px-6 pt-5 pb-3">
                  <h3 className="text-base font-semibold text-[#111827]">
                    Acknowledgements · {doc.current?.version}
                  </h3>
                  <span className={cn("text-xs font-semibold", signed === doc.acknowledgements.length ? "text-[#16a34a]" : "text-[#dc2626]")}>
                    {signed} of {doc.acknowledgements.length} acknowledged
                  </span>
                </div>
                <PagedTable
                  rows={doc.acknowledgements}
                  rowKey={(ack) => `${ack.worker}-${ack.entity}`}
                  empty="No installers are asked to sign this document."
                  columns={[
                    { key: "worker", header: "Worker", render: (ack) => <span className="text-[#111827]">{ack.worker}</span> },
                    { key: "entity", header: "Entity", render: (ack) => ack.entity },
                    {
                      key: "ack",
                      header: "Acknowledgement",
                      render: (ack) => <StatusBadge status={ack.acknowledged_at ? "current" : "due-soon"} label={ack.acknowledged_at ? "Acknowledged" : "Outstanding"} />,
                    },
                    {
                      key: "when",
                      header: "Action",
                      render: (ack) => <span className="text-[13px] text-[#64748b]">{ack.acknowledged_at ? `Recorded ${formatTime(ack.acknowledged_at)}` : "Awaiting worker"}</span>,
                    },
                  ]}
                />
              </Panel>
            ) : null}

            {doc.kind === "swms" ? (
              <Panel className="flex flex-col gap-3 p-6">
                <h3 className="text-base font-semibold text-[#111827]">On-site changes</h3>
                {doc.changes.length === 0 ? <p className="text-xs text-[#64748b]">No on-site changes recorded against this version.</p> : null}
                {doc.changes.map((change) => (
                  <div key={change.id} className="flex flex-col gap-2 rounded-[8px] border border-[#f1f5f9] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[13px] font-semibold text-[#111827]">{change.change}</p>
                      <span className={cn("inline-flex shrink-0 rounded-[4px] px-2 py-0.5 text-[11px] font-medium", CHANGE_STATE[change.state]?.className)}>
                        {CHANGE_STATE[change.state]?.label}
                      </span>
                    </div>
                    <p className="text-xs text-[#64748b]">
                      {formatIsoDate(change.date)} {change.time} · {change.reported_by}
                      {change.site ? ` · ${change.site}` : ""} · Risk {change.risk_before} → {change.risk_after} · Approved / briefed by {change.approved_by} ·{" "}
                      {change.signoffs} signed
                    </p>
                    <p className="text-xs text-[#475569]">Control: {change.control}</p>
                    {change.state === "sent-back" && change.review_reason ? <p className="text-xs text-[#b91c1c]">Sent back: {change.review_reason}</p> : null}
                    {change.state === "awaiting-review" && !doc.archived ? (
                      <div className="flex gap-2">
                        <SafetyButton className="h-9" onClick={() => void handleValidate(change.id)}>
                          Validate
                        </SafetyButton>
                        <SafetyButton variant="secondary" className="h-9" onClick={() => setSendingBack(change.id)}>
                          Send Back
                        </SafetyButton>
                      </div>
                    ) : null}
                  </div>
                ))}
              </Panel>
            ) : null}

            <ActivityPanel lines={doc.activity.map((entry) => ({ at: entry.at, text: entry.text, by: entry.by, details: entry.details }))} />
          </>
        }
        side={
          <>
            <SideCard title="Evidence">
              <EvidencePreview fileName={doc.current?.file_name ?? "No file"} />
              {doc.current?.url ? (
                <SideButton filled onClick={() => window.open(doc.current?.url ?? "", "_blank", "noopener")}>
                  Open Document
                </SideButton>
              ) : null}
            </SideCard>
            <ReminderScheduleCard text={reminderText(reviewReminderDays(doc.kind), "review")} />
          </>
        }
      />
    </MgmtPage>
  );
}
