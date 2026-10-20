import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { ACTIVITY_TEXT, ActivityPanel, MgmtPage, ReminderScheduleCard } from "@/components/whs/management";
import { ReasonDialog } from "@/components/whs/reason-dialog";
import { DetailsLayout, EvidencePreview, SideButton, SideCard } from "@/components/whs/record-cards";
import { Field, TextInput } from "@/components/whs/safety-form";
import { DetailGrid, Notice, Panel, StatusBadge, reminderText } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";
import { formatIsoDate, formatTime } from "@/lib/upload-file";

export const Route = createFileRoute("/_management/management/accreditations/$key")({
  component: ReviewAccreditation,
});

/**
 * M11 Review evidence for management (framework 10, decision AD43): the same
 * check as the admin's Review Evidence. Verify (optionally correcting the
 * expiry) or request new evidence with a reason. Management never uploads.
 */
function ReviewAccreditation() {
  const { key } = Route.useParams();
  const detail = useQuery(api.accreditations.adminDetail, { key });
  const verify = useMutation(api.accreditations.verify);
  const reject = useMutation(api.accreditations.reject);
  const [expires, setExpires] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const back = { to: "/management/exceptions", label: "Exceptions" };

  if (detail === undefined || detail === null) {
    return (
      <MgmtPage title="Review Evidence" back={back}>
        <Panel className="p-6 text-sm text-[#64748b]">{detail === undefined ? "Loading…" : "This accreditation could not be found."}</Panel>
      </MgmtPage>
    );
  }
  const evidence = detail.evidence;
  const waiting = detail.pending_version_id !== undefined && detail.can_verify;

  const handleVerify = async () => {
    if (!detail.pending_version_id) return;
    setBusy(true);
    try {
      await verify({ version_id: detail.pending_version_id, expires: expires || undefined });
      toast.success(`${detail.type} verified`, { description: `${detail.worker} has been emailed.` });
      setExpires("");
    } catch (error) {
      toast.error(toUserMessage(error, "Could not verify that evidence."));
    } finally {
      setBusy(false);
    }
  };

  const handleRequest = async (reason: string) => {
    if (!detail.pending_version_id) return;
    try {
      await reject({ version_id: detail.pending_version_id, reason });
      toast.success("Request sent", { description: `${detail.worker} sees it as Action required and gets an email.` });
    } catch (error) {
      toast.error(toUserMessage(error, "Could not send that request."));
      throw error;
    }
  };

  return (
    <MgmtPage title={waiting ? `Review ${detail.type}` : detail.type} description={`Management · ${detail.worker} · ${detail.entity}`} back={back}>
      <ReasonDialog
        open={requesting}
        title="Request new evidence"
        description={`${detail.worker} will see the ${detail.type} as Action required, with your reason, and get an email. The evidence stays unverified.`}
        placeholder="e.g. Please upload the complete certificate with the worker name and expiry date clearly visible."
        confirmLabel="Send Request"
        missingMessage="Enter a reason, so the worker knows what to fix."
        onClose={() => setRequesting(false)}
        onConfirm={handleRequest}
      />
      <DetailsLayout
        main={
          <>
            <Panel className="flex flex-col gap-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold text-[#111827]">{waiting ? `Review ${detail.type}` : "Accreditation details"}</h2>
                <StatusBadge status={detail.status} />
              </div>
              <DetailGrid
                columns={2}
                items={[
                  { label: "Worker", value: detail.worker },
                  { label: "Company", value: detail.entity },
                  { label: "Card number", value: evidence?.number ?? "—" },
                  { label: "Accreditation", value: detail.type },
                  { label: "Issue date", value: formatIsoDate(evidence?.issued) },
                  { label: "Expiry on evidence", value: evidence ? (evidence.no_expiry ? "No expiry entered" : formatIsoDate(evidence.expires)) : "—" },
                  { label: "Uploaded by", value: evidence ? `${evidence.uploaded_by ?? "—"} · ${formatTime(evidence.uploaded_at)}` : "—" },
                  { label: "Verified by", value: evidence?.verified_by ? `${evidence.verified_by} · ${formatTime(evidence.verified_at)}` : "—" },
                ]}
              />
              {waiting ? (
                <>
                  <p className="text-[13px] text-[#64748b]">Check the worker name, credential, dates and legibility against the uploaded file before deciding.</p>
                  <Field
                    label={evidence?.no_expiry ? "Expiry date (add it if the document shows one)" : "Correct the expiry date (optional)"}
                    className="max-w-xs"
                  >
                    <TextInput type="date" value={expires} onChange={setExpires} />
                  </Field>
                </>
              ) : null}
            </Panel>
            {detail.status === "action-required" && evidence?.rejected_reason ? (
              <Notice tone="danger">New evidence requested: {evidence.rejected_reason}. The worker sees this as Action required.</Notice>
            ) : null}
            {detail.status === "missing" ? <Notice tone="warning">{detail.worker} hasn't uploaded this yet. Contact your administrator if it's needed urgently.</Notice> : null}
            {waiting ? (
              <Panel className="flex flex-col gap-3 p-6">
                <h3 className="text-base font-semibold text-[#111827]">Evidence review</h3>
                <p className="text-[13px] text-[#64748b]">
                  Open the uploaded file and compare it with the record details. If it is incomplete or unreadable, request a replacement before verifying.
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
              <EvidencePreview fileName={evidence?.file_name ?? "No evidence uploaded"} />
              {evidence?.url ? <SideButton onClick={() => window.open(evidence.url ?? "", "_blank", "noopener")}>Open Evidence</SideButton> : null}
              {waiting ? (
                <>
                  <SideButton filled onClick={() => void handleVerify()} disabled={busy}>
                    {busy ? "Verifying…" : "Verify Evidence"}
                  </SideButton>
                  <SideButton onClick={() => setRequesting(true)}>Request New Evidence</SideButton>
                </>
              ) : null}
            </SideCard>
            <ReminderScheduleCard text={reminderText(detail.reminder_days, "expiry")} />
          </>
        }
      />
    </MgmtPage>
  );
}
