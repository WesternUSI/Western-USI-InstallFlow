import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { ReasonDialog } from "@/components/whs/reason-dialog";
import { CheckboxRow, Field, FieldRow, FormCard, TextInput } from "@/components/whs/safety-form";
import { Notice, Panel, SafetyButton, SafetyPage } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";
import { formatIsoDate } from "@/lib/upload-file";

export const Route = createFileRoute("/_auth/safety/insurance/$policyId/verify")({
  component: VerifyInsuranceEvidence,
});

/**
 * SC07 Verify Insurance Evidence, real: a certificate a subcontractor
 * uploaded (framework 10). The admin confirms the expiry and verifies, or
 * requests a replacement with a reason.
 */
function VerifyInsuranceEvidence() {
  const { policyId } = Route.useParams();
  const policy = useQuery(api.insurance.adminDetail, { policy_id: policyId });
  const verify = useMutation(api.insurance.adminVerify);
  const reject = useMutation(api.insurance.adminReject);
  const navigate = useNavigate();
  const [expires, setExpires] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [errors, setErrors] = useState<{ expires?: string; confirmed?: string }>({});
  const [busy, setBusy] = useState(false);

  if (policy === undefined || policy === null) {
    return (
      <SafetyPage title="Verify Insurance Evidence" description="" back={{ to: "/safety/insurance", label: "Insurance Register" }}>
        <Panel className="p-6 text-sm text-[#64748b]">{policy === undefined ? "Loading…" : "This policy could not be found."}</Panel>
      </SafetyPage>
    );
  }
  const certificate = policy.certificate;
  const pendingId = policy.pending_certificate_id;
  if (pendingId === undefined || certificate === null) {
    return (
      <SafetyPage title="Verify Insurance Evidence" description={`${policy.type} · ${policy.entity}`} back={{ to: "/safety/insurance/$policyId", label: "Policy details", params: { policyId } }}>
        <Notice tone="success">Nothing is waiting to be checked on this policy.</Notice>
      </SafetyPage>
    );
  }
  const expiresValue = expires ?? certificate.expires;

  const doVerify = async () => {
    const found: typeof errors = {};
    if (expiresValue === "") found.expires = "Confirm the expiry date shown on the certificate.";
    if (!confirmed) found.confirmed = "Tick the box to confirm you've reviewed the certificate.";
    setErrors(found);
    const first = Object.values(found)[0];
    if (first) {
      toast.error(first);
      return;
    }
    setBusy(true);
    try {
      await verify({ certificate_id: pendingId as Id<"insurance_certificates">, expires: expiresValue });
      toast.success("Evidence verified");
      void navigate({ replace: true, to: "/safety/insurance/$policyId", params: { policyId }, search: { renewed: true } });
    } catch (caught) {
      toast.error(toUserMessage(caught, "Could not verify that certificate."));
    } finally {
      setBusy(false);
    }
  };

  const doReject = async (reason: string) => {
    try {
      await reject({ certificate_id: pendingId as Id<"insurance_certificates">, reason });
      toast.success("Replacement requested");
      void navigate({ replace: true, to: "/safety/insurance/$policyId", params: { policyId } });
    } catch (caught) {
      toast.error(toUserMessage(caught, "Could not send that request."));
      throw caught;
    }
  };

  return (
    <SafetyPage title="Verify Insurance Evidence" description={`${policy.type} · ${policy.entity}`} back={{ to: "/safety/insurance/$policyId", label: "Policy details", params: { policyId } }}>
      <ReasonDialog
        open={requesting}
        title="Request a replacement certificate"
        description={`${policy.entity} will see this policy as Action required, with your reason.`}
        placeholder="e.g. The certificate is for last year's policy."
        confirmLabel="Send Request"
        missingMessage="Enter a reason, so the subcontractor knows what to fix."
        onClose={() => setRequesting(false)}
        onConfirm={doReject}
      />
      <FormCard title="Record details">
        <p className="text-[13px] text-[#64748b]">Compare the certificate with the insured entity, policy type, dates and coverage.</p>
        {certificate.url ? (
          <button type="button" onClick={() => window.open(certificate.url ?? "", "_blank", "noopener")} className="w-fit text-[13px] font-semibold text-[#2563eb] hover:underline">
            Open certificate preview
          </button>
        ) : null}
        <FieldRow>
          <Field label="Evidence file">
            <TextInput value={certificate.file_name} onChange={() => undefined} />
          </Field>
          <Field label="Submitted by">
            <TextInput value={certificate.uploaded_by ?? "—"} onChange={() => undefined} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Policy start">
            <TextInput value={formatIsoDate(certificate.start)} onChange={() => undefined} />
          </Field>
          <Field label="Expiry to confirm" required error={errors.expires}>
            <TextInput type="date" value={expiresValue} onChange={setExpires} invalid={!!errors.expires} />
          </Field>
        </FieldRow>
        <Notice tone="info">The reviewer and decision are recorded automatically. Subcontractor contacts cannot verify their own evidence.</Notice>
        <div className="flex flex-col gap-1">
          <CheckboxRow checked={confirmed} onChange={setConfirmed}>
            I have reviewed the certificate and confirmed the details above.
          </CheckboxRow>
          {errors.confirmed ? <span className="text-xs font-medium text-[#dc2626]">{errors.confirmed}</span> : null}
        </div>
        <div className="flex flex-wrap gap-3">
          <SafetyButton variant="secondary" onClick={() => setRequesting(true)} disabled={busy}>
            Request Replacement
          </SafetyButton>
          <SafetyButton onClick={() => void doVerify()} disabled={busy}>
            Verify Evidence
          </SafetyButton>
        </div>
      </FormCard>
    </SafetyPage>
  );
}
