import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FieldRow, FilePicker, FormCard, SelectInput, TextInput } from "@/components/whs/safety-form";
import { Notice, SafetyButton, SafetyPage } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";
import { uploadFile } from "@/lib/upload-file";
import { useInspectors } from "@/lib/use-people";

export const Route = createFileRoute("/_auth/safety/records/new/accreditation")({
  component: AddWorkerAccreditation,
});

type Errors = Partial<Record<"worker" | "type" | "otherName" | "expires" | "file", string>>;

/** The list's last choice: a card that isn't in the list, typed in and held by this worker only (decision AD40). */
const OTHER = "other";

/**
 * F3 Add Worker Accreditation, real (framework 4B). A blank expiry means no
 * expiry (S6). Evidence the admin adds is recorded as verified by them (V4).
 */
function AddWorkerAccreditation() {
  const navigate = useNavigate();
  const workers = useInspectors();
  const types = useQuery(api.accreditations.types);
  const generateUploadUrl = useMutation(api.accreditations.generateUploadUrl);
  const addEvidence = useMutation(api.accreditations.adminAddEvidence);

  const [worker, setWorker] = useState("");
  const [type, setType] = useState("");
  const [otherName, setOtherName] = useState("");
  const [number, setNumber] = useState("");
  const [issued, setIssued] = useState("");
  const [expires, setExpires] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const found: Errors = {};
    if (worker === "") found.worker = "Select the worker this accreditation belongs to.";
    if (type === "") found.type = "Select the accreditation type, or choose Other.";
    if (type === OTHER && otherName.trim() === "") found.otherName = "Enter the name of the accreditation.";
    if (issued && expires && expires < issued) found.expires = "The expiry date can't be before the issue date.";
    if (file === null) found.file = "Choose the accreditation evidence to upload.";
    setErrors(found);
    const first = Object.values(found)[0];
    if (first || file === null) {
      toast.error(first ?? "Check the details and try again.");
      return;
    }
    setSaving(true);
    try {
      const fileId = await uploadFile(await generateUploadUrl(), file);
      const { record_id } = await addEvidence({
        worker_id: worker as Id<"users">,
        ...(type === OTHER ? { new_type_name: otherName.trim() } : { type_id: type as Id<"accreditation_types"> }),
        file_id: fileId,
        file_name: file.name,
        content_type: file.type || undefined,
        number: number.trim() || undefined,
        issued: issued || undefined,
        expires: expires || undefined,
      });
      toast.success("Accreditation saved and verified");
      void navigate({ replace: true, to: "/safety/accreditations/$accreditationId", params: { accreditationId: record_id } });
    } catch (caught) {
      toast.error(toUserMessage(caught, "Could not save that accreditation."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafetyPage title="Add Worker Accreditation" description="Link evidence to the correct worker and credential." back={{ to: "/safety/accreditations", label: "Worker Accreditations" }}>
      <FormCard title="Record details">
        <FieldRow>
          <Field label="Worker" required error={errors.worker}>
            <SelectInput value={worker} onChange={setWorker} options={workers} invalid={!!errors.worker} />
          </Field>
          <Field label="Accreditation type" required error={errors.type}>
            <SelectInput
              value={type}
              onChange={(value) => {
                setType(value);
                setErrors((current) => ({ ...current, type: undefined, otherName: undefined }));
              }}
              options={[...(types ?? []).map((entry) => ({ value: entry.id, label: entry.name })), { value: OTHER, label: "Other (type the name)" }]}
              invalid={!!errors.type}
            />
          </Field>
        </FieldRow>
        {type === OTHER ? (
          <Field label="Name of the accreditation" required error={errors.otherName} hint="Only this worker holds it. To require it of a whole company, use Add Accreditation on the company's page.">
            <TextInput
              value={otherName}
              onChange={(value) => {
                setOtherName(value);
                setErrors((current) => ({ ...current, otherName: undefined }));
              }}
              placeholder="e.g. Forklift Licence"
              invalid={!!errors.otherName}
            />
          </Field>
        ) : null}
        <FieldRow>
          <Field label="Card / licence number">
            <TextInput value={number} onChange={setNumber} placeholder="Enter card number" />
          </Field>
          <Field label="Issue date">
            <TextInput type="date" value={issued} onChange={setIssued} />
          </Field>
        </FieldRow>
        <Field label="Expiry date" hint="Leave blank if it doesn't expire." error={errors.expires} className="sm:max-w-[calc(50%-10px)]">
          <TextInput type="date" value={expires} onChange={setExpires} invalid={!!errors.expires} />
        </Field>
        <FilePicker file={file} onChange={setFile} error={errors.file} />
        <Notice tone="info">Reminders default to 60, 30, 14 and 7 days before expiry. Evidence you upload here is recorded as verified by you.</Notice>
        <div className="flex flex-wrap gap-3">
          <SafetyButton variant="secondary" to="/safety/records/new">
            Cancel
          </SafetyButton>
          <SafetyButton onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save Accreditation"}
          </SafetyButton>
        </div>
      </FormCard>
    </SafetyPage>
  );
}
