import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FieldRow, FilePicker, FormCard, TextInput } from "@/components/whs/safety-form";
import { Notice, Panel, SafetyButton } from "@/components/whs/safety-ui";
import { CancelButton, MAX_UPLOAD_BYTES, SubPage } from "@/components/whs/subcontractor-portal";
import { toUserMessage } from "@/lib/errors";
import { uploadFile } from "@/lib/upload-file";

export const Route = createFileRoute("/_subcontractor/subcontractor/insurance/$policyId/renew")({
  component: UploadInsuranceRenewal,
});

type Errors = Partial<Record<"start" | "expires" | "file", string>>;

/**
 * S4 Upload Insurance Renewal (framework 8: upload the new document, enter
 * the new expiry date; Western USI verifies). The business and policy are
 * fixed. The policy dates are added to the Figma's form because framework 8
 * asks for them; its Notes box is left out (a certificate has no notes).
 * The certificate waits for Western USI to verify it (decision AD50).
 */
function UploadInsuranceRenewal() {
  const { policyId } = Route.useParams();
  const policy = useQuery(api.subcontractorPortal.policy, { policy_id: policyId });
  const company = useQuery(api.subcontractorPortal.company);
  const generateUploadUrl = useMutation(api.subcontractorPortal.generateUploadUrl);
  const upload = useMutation(api.subcontractorPortal.uploadInsuranceRenewal);
  const navigate = useNavigate();
  const [start, setStart] = useState("");
  const [expires, setExpires] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const back = { to: "/subcontractor/insurance/$policyId", label: "Policy details", params: { policyId } };

  if (policy === undefined || policy === null) {
    return (
      <SubPage title="Upload Insurance Renewal" back={{ to: "/subcontractor/insurance", label: "Our Insurance" }}>
        <Panel className="p-6 text-sm text-[#64748b]">{policy === undefined ? "Loading…" : "This policy could not be found."}</Panel>
      </SubPage>
    );
  }

  const submit = async () => {
    const found: Errors = {};
    if (start === "") found.start = "Select the policy start date on the new certificate.";
    if (expires === "") found.expires = "Select the expiry date on the new certificate.";
    else if (start !== "" && expires <= start) found.expires = "The expiry date must be after the start date.";
    if (file === null) found.file = "Choose the certificate of currency to upload.";
    else if (file.size > MAX_UPLOAD_BYTES) found.file = "This file is over 20 MB. Choose a smaller file.";
    setErrors(found);
    const first = Object.values(found)[0];
    if (first || file === null) {
      toast.error(first ?? "Check the details and try again.");
      return;
    }
    setSaving(true);
    try {
      const fileId = await uploadFile(await generateUploadUrl(), file);
      await upload({ policy_id: policyId, start, expires, file_id: fileId, file_name: file.name, content_type: file.type || undefined });
      void navigate({ replace: true, to: "/subcontractor/insurance/$policyId/submitted", params: { policyId } });
    } catch (caught) {
      toast.error(toUserMessage(caught, "Could not upload that renewal. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SubPage title="Upload Insurance Renewal" back={back}>
      <FormCard title="Record details">
        <FieldRow>
          <Field label="Business" hint="Your business is fixed.">
            <TextInput value={company?.name ?? policy.entity} onChange={() => undefined} />
          </Field>
          <Field label="Policy" hint="The renewal is attached to this policy.">
            <TextInput value={policy.policy_number ? `${policy.type} · ${policy.policy_number}` : policy.type} onChange={() => undefined} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Policy start date" required error={errors.start}>
            <TextInput type="date" value={start} onChange={setStart} invalid={!!errors.start} />
          </Field>
          <Field label="Expiry date" required error={errors.expires}>
            <TextInput type="date" value={expires} onChange={setExpires} invalid={!!errors.expires} />
          </Field>
        </FieldRow>
        <FilePicker file={file} onChange={setFile} error={errors.file} />
        <Notice tone="info">Western USI will check the certificate, confirm the policy dates and update the register. You can't verify the upload yourself.</Notice>
        <div className="flex flex-wrap gap-3">
          <CancelButton to="/subcontractor/insurance/$policyId" params={{ policyId }} />
          <SafetyButton onClick={() => void submit()} disabled={saving}>
            {saving ? "Uploading…" : "Submit Renewal"}
          </SafetyButton>
        </div>
      </FormCard>
    </SubPage>
  );
}
