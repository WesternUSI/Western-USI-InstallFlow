import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { ACTIVITY_TEXT, ActivityPanel, MgmtPage, ReminderScheduleCard } from "@/components/whs/management";
import { ReasonDialog } from "@/components/whs/reason-dialog";
import { DetailsLayout, EvidencePreview, SideButton, SideCard } from "@/components/whs/record-cards";
import { CheckboxRow, Field, TextInput } from "@/components/whs/safety-form";
import { DetailGrid, Notice, Panel, StatusBadge, reminderText } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";
import { formatIsoDate } from "@/lib/upload-file";

export const Route = createFileRoute("/_management/management/insurance/$policyId")({
  component: PolicyForManagement,
});

/**
 * M7 A policy for management (framework 4C, decision AD43). Read-only, except
 * a certificate waiting for review: confirm its expiry and verify it, or
 * request a replacement with a reason. Management never uploads.
 */
function PolicyForManagement() {
  const { policyId } = Route.useParams();
  const policy = useQuery(api.insurance.adminDetail, { policy_id: policyId });
  const verify = useMutation(api.insurance.adminVerify);
  const reject = useMutation(api.insurance.adminReject);
  const [expires, setExpires] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<{ expires?: string; confirmed?: string }>({});
  const [requesting, setRequesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const back = { to: "/management/exceptions", label: "Exceptions" };

  if (policy === undefined || policy === null) {
    return (
      <MgmtPage title="Policy" back={back}>
        <Panel className="p-6 text-sm text-[#64748b]">{policy === undefined ? "Loading…" : "This policy could not be found."}</Panel>
      </MgmtPage>
    );
  }
  const certificate = policy.certificate;
  const pendingId = policy.pending_certificate_id;
  const expiresValue = expires ?? certificate?.expires ?? "";

  const doVerify = async () => {
    if (pendingId === undefined) return;
    const found: typeof errors = {};
    if (expiresValue === "") found.expires = "Confirm the expiry date shown on the certificate";
    if (!confirmed) found.confirmed = "Tick the box to confirm you've checked the certificate";
    setErrors(found);
    const first = Object.values(found)[0];
    if (first) {
      toast.error(first);
      return;
    }
    setBusy(true);
    try {
      await verify({ certificate_id: pendingId as Id<"insurance_certificates">, expires: expiresValue });
      toast.success("Certificate verified");
      setConfirmed(false);
    } catch (error) {
      toast.error(toUserMessage(error, "Could not verify that certificate."));
    } finally {
      setBusy(false);
    }
  };

  const doRequest = async (reason: string) => {
    if (pendingId === undefined) return;
    try {
      await reject({ certificate_id: pendingId as Id<"insurance_certificates">, reason });
      toast.success("Replacement requested");
    } catch (error) {
      toast.error(toUserMessage(error, "Could not send that request."));
      throw error;
    }
  };

  return (
    <MgmtPage title={policy.type} description={`Management · ${policy.entity}`} back={back}>
      <ReasonDialog
        open={requesting}
        title="Request a replacement certificate"
        description={`${policy.entity} will see this policy as Action required, with your reason.`}
        placeholder="e.g. The certificate is for last year's policy."
        confirmLabel="Send Request"
        missingMessage="Enter a reason, so they know what to fix."
        onClose={() => setRequesting(false)}
        onConfirm={doRequest}
      />
      {policy.archived ? <Notice tone="warning">This policy is archived. It is kept with its history but no longer used.</Notice> : null}
      {policy.status === "expired" ? <Notice tone="warning">The certificate has expired. The warning stays until a replacement is verified.</Notice> : null}
      <DetailsLayout
        main={
          <>
            <Panel className="flex flex-col gap-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold text-[#111827]">{policy.type}</h2>
                <StatusBadge status={policy.status} />
              </div>
              <DetailGrid
                columns={2}
                items={[
                  { label: "Entity", value: policy.entity },
                  { label: "Policy number", value: policy.policy_number ?? "—" },
                  { label: "Insurer", value: policy.insurer },
                  { label: "Coverage", value: policy.coverage },
                  { label: "Start date", value: formatIsoDate(certificate?.start) },
                  { label: "Expiry", value: formatIsoDate(certificate?.expires) },
                  { label: "Responsible person", value: policy.responsible ?? "The admin list" },
                  { label: "Verification", value: certificate?.verified_by ? `Verified by ${certificate.verified_by}` : "Not verified" },
                ]}
              />
            </Panel>
            {pendingId !== undefined && certificate ? (
              <Panel className="flex flex-col gap-4 p-6">
                <h3 className="text-base font-semibold text-[#111827]">Certificate waiting for review</h3>
                <p className="text-[13px] text-[#64748b]">Compare the certificate with the insured entity, policy type, dates and coverage, then confirm the expiry.</p>
                <Field label="Expiry to confirm" required error={errors.expires} className="max-w-xs">
                  <TextInput type="date" value={expiresValue} onChange={setExpires} invalid={!!errors.expires} />
                </Field>
                <div className="flex flex-col gap-1">
                  <CheckboxRow checked={confirmed} onChange={setConfirmed}>
                    I have checked the complete certificate and it belongs to this policy
                  </CheckboxRow>
                  {errors.confirmed ? <span className="text-xs font-medium text-[#dc2626]">{errors.confirmed}</span> : null}
                </div>
              </Panel>
            ) : null}
            <ActivityPanel
              lines={policy.activity.map((entry) => ({ at: entry.at, text: ACTIVITY_TEXT[entry.action] ?? entry.action, by: entry.by, details: entry.details }))}
            />
          </>
        }
        side={
          <>
            <SideCard title="Evidence">
              <EvidencePreview fileName={certificate?.file_name ?? "No certificate"} />
              {certificate?.url ? <SideButton onClick={() => window.open(certificate.url ?? "", "_blank", "noopener")}>Open Certificate</SideButton> : null}
              {pendingId !== undefined ? (
                <>
                  <SideButton filled onClick={() => void doVerify()} disabled={busy}>
                    {busy ? "Verifying…" : "Verify Certificate"}
                  </SideButton>
                  <SideButton onClick={() => setRequesting(true)}>Request Replacement</SideButton>
                </>
              ) : null}
            </SideCard>
            <ReminderScheduleCard text={reminderText([60, 30, 14, 7], "expiry")} />
          </>
        }
      />
    </MgmtPage>
  );
}
