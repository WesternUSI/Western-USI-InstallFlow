import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FieldRow, FilePicker, FormCard, SelectInput, TextInput } from "@/components/whs/safety-form";
import { Notice, SafetyButton, SafetyPage } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";
import { INSURANCE_TYPES, type InsuranceType } from "@/lib/insurance-types";
import { uploadFile } from "@/lib/upload-file";
import { useResponsiblePeople } from "@/lib/use-people";

export const Route = createFileRoute("/_auth/safety/records/new/insurance")({
  component: AddInsurancePolicy,
});

const WESTERN_USI = "western-usi";
type Errors = Partial<Record<"type" | "entity" | "insurer" | "coverage" | "start" | "expires" | "file", string>>;

/** F4 Add Insurance Policy, real (framework 4C fields). Verified straight away (V4). */
function AddInsurancePolicy() {
  const navigate = useNavigate();
  const subcontractors = useQuery(api.subcontractors.list);
  const people = useResponsiblePeople();
  const generateUploadUrl = useMutation(api.insurance.generateUploadUrl);
  const create = useMutation(api.insurance.adminCreate);

  const [type, setType] = useState("");
  const [entity, setEntity] = useState("");
  const [insurer, setInsurer] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [coverage, setCoverage] = useState("");
  const [start, setStart] = useState("");
  const [expires, setExpires] = useState("");
  const [responsible, setResponsible] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const found: Errors = {};
    if (type === "") found.type = "Select the policy type.";
    if (entity === "") found.entity = "Select who the policy insures.";
    if (insurer.trim() === "") found.insurer = "Enter the insurer.";
    if (coverage.trim() === "") found.coverage = "Enter the coverage, e.g. $10,000,000 or Statutory.";
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
      const policyId = await create({
        insurance_type: type as InsuranceType,
        subcontractor_id: entity === WESTERN_USI ? undefined : (entity as Id<"subcontractors">),
        insurer: insurer.trim(),
        policy_number: policyNumber.trim() || undefined,
        coverage: coverage.trim(),
        responsible_user_id: responsible === "" ? undefined : (responsible as Id<"users">),
        start,
        expires,
        file_id: fileId,
        file_name: file.name,
        content_type: file.type || undefined,
      });
      toast.success("Policy saved and verified");
      void navigate({ replace: true, to: "/safety/insurance/$policyId", params: { policyId } });
    } catch (caught) {
      toast.error(toUserMessage(caught, "Could not save that policy."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafetyPage title="Add Insurance Policy" description="Maintain a policy and certificate of currency for the selected entity." back={{ to: "/safety/insurance", label: "Insurance Register" }}>
      <FormCard title="Record details">
        <FieldRow>
          <Field label="Policy type" required error={errors.type}>
            <SelectInput value={type} onChange={setType} options={[...INSURANCE_TYPES]} invalid={!!errors.type} />
          </Field>
          <Field label="Insured entity" required error={errors.entity}>
            <SelectInput
              value={entity}
              onChange={setEntity}
              options={[{ value: WESTERN_USI, label: "Western USI" }, ...(subcontractors ?? []).map((row) => ({ value: row._id as string, label: row.name }))]}
              invalid={!!errors.entity}
            />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Insurer" required error={errors.insurer}>
            <TextInput value={insurer} onChange={setInsurer} placeholder="e.g. Allianz" invalid={!!errors.insurer} />
          </Field>
          <Field label="Policy number">
            <TextInput value={policyNumber} onChange={setPolicyNumber} placeholder="Enter policy number" />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Coverage" required error={errors.coverage}>
            <TextInput value={coverage} onChange={setCoverage} placeholder="e.g. $10,000,000" invalid={!!errors.coverage} />
          </Field>
          <Field label="Responsible person">
            <SelectInput value={responsible} onChange={setResponsible} options={people} placeholder="The admin list" />
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
        <Notice tone="info">Reminders default to 60, 30, 14 and 7 days before expiry. Previous certificates are kept, never overwritten.</Notice>
        <div className="flex flex-wrap gap-3">
          <SafetyButton variant="secondary" to="/safety/records/new">
            Cancel
          </SafetyButton>
          <SafetyButton onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save Policy"}
          </SafetyButton>
        </div>
      </FormCard>
    </SafetyPage>
  );
}
