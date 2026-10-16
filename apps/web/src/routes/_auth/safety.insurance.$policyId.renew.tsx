import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FieldRow, FilePicker, FormCard, SelectInput, TextInput } from "@/components/whs/safety-form";
import { Notice, Panel, SafetyButton, SafetyPage } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";
import { uploadFile } from "@/lib/upload-file";
import { useResponsiblePeople } from "@/lib/use-people";

export const Route = createFileRoute("/_auth/safety/insurance/$policyId/renew")({
  component: UploadInsuranceRenewal,
});

type Errors = Partial<Record<"insurer" | "coverage" | "start" | "expires" | "file", string>>;

/** SC06 Upload Insurance Renewal, real. An admin's upload is verified straight away (V4); the old certificate is kept. */
function UploadInsuranceRenewal() {
  const { policyId } = Route.useParams();
  const policy = useQuery(api.insurance.adminDetail, { policy_id: policyId });
  const generateUploadUrl = useMutation(api.insurance.generateUploadUrl);
  const renew = useMutation(api.insurance.adminRenew);
  const people = useResponsiblePeople();
  const navigate = useNavigate();
  const [insurer, setInsurer] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<string | null>(null);
  const [start, setStart] = useState("");
  const [expires, setExpires] = useState("");
  const [responsible, setResponsible] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  if (policy === undefined || policy === null) {
    return (
      <SafetyPage title="Upload Insurance Renewal" description="" back={{ to: "/safety/insurance", label: "Insurance Register" }}>
        <Panel className="p-6 text-sm text-[#64748b]">{policy === undefined ? "Loading…" : "This policy could not be found."}</Panel>
      </SafetyPage>
    );
  }
  const insurerValue = insurer ?? policy.insurer;
  const coverageValue = coverage ?? policy.coverage;

  const save = async () => {
    const found: Errors = {};
    if (insurerValue.trim() === "") found.insurer = "Enter the insurer.";
    if (coverageValue.trim() === "") found.coverage = "Enter the coverage.";
    if (start === "") found.start = "Select the policy start date.";
    if (expires === "") found.expires = "Select the expiry date.";
    else if (start !== "" && expires <= start) found.expires = "The expiry date must be after the start date.";
    if (file === null) found.file = "Choose the certificate of currency to upload.";
    setErrors(found);
    const first = Object.values(found)[0];
    if (first || file === null) {
      toast.error(first ?? "Check the details and try again.");
      return;
    }
    setSaving(true);
    try {
      const fileId = await uploadFile(await generateUploadUrl(), file);
      await renew({
        policy_id: policyId as Id<"insurance_policies">,
        insurer: insurerValue.trim(),
        coverage: coverageValue.trim(),
        responsible_user_id: responsible === "" ? undefined : (responsible as Id<"users">),
        start,
        expires,
        file_id: fileId,
        file_name: file.name,
        content_type: file.type || undefined,
      });
      toast.success("Renewal saved and verified");
      void navigate({ replace: true, to: "/safety/insurance/$policyId", params: { policyId }, search: { renewed: true } });
    } catch (caught) {
      toast.error(toUserMessage(caught, "Could not save that renewal."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafetyPage title="Upload Insurance Renewal" description={`${policy.type} · ${policy.entity}`} back={{ to: "/safety/insurance/$policyId", label: "Policy details", params: { policyId } }}>
      <FormCard title="Record details">
        <FieldRow>
          <Field label="Insured entity">
            <TextInput value={policy.entity} onChange={() => undefined} />
          </Field>
          <Field label="Insurance type">
            <TextInput value={policy.type} onChange={() => undefined} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Insurer" required error={errors.insurer}>
            <TextInput value={insurerValue} onChange={setInsurer} invalid={!!errors.insurer} />
          </Field>
          <Field label="Coverage" required error={errors.coverage}>
            <TextInput value={coverageValue} onChange={setCoverage} invalid={!!errors.coverage} />
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
        <Field label="Responsible person" hint={policy.responsible ? `Currently ${policy.responsible}` : "Currently the admin list"}>
          <SelectInput value={responsible} onChange={setResponsible} options={people} placeholder="Keep as it is" />
        </Field>
        <FilePicker file={file} onChange={setFile} error={errors.file} />
        <Notice tone="info">Reminders use the insurance default: 60, 30, 14 and 7 days. The previous certificate is retained. Uploaded by you, so it's recorded as verified.</Notice>
        <div className="flex flex-wrap gap-3">
          <SafetyButton variant="secondary" to="/safety/insurance/$policyId" params={{ policyId }}>
            Cancel
          </SafetyButton>
          <SafetyButton onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save Renewal"}
          </SafetyButton>
        </div>
      </FormCard>
    </SafetyPage>
  );
}
