import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FieldRow, FilePicker, FormCard, SelectInput, TextArea, TextInput } from "@/components/whs/safety-form";
import { Notice, SafetyButton, SafetyPage } from "@/components/whs/safety-ui";
import { useAgreement, useSubcontractor } from "@/components/whs/subcontractor-header";
import { toUserMessage } from "@/lib/errors";
import { formatIsoDate, uploadFile } from "@/lib/upload-file";
import { useResponsiblePeople } from "@/lib/use-people";

export const Route = createFileRoute("/_auth/safety/subcontractors/$subcontractorId/agreement")({
  component: UploadSignedAgreement,
});

type Errors = Partial<Record<"signed" | "review" | "file", string>>;

/**
 * SC09 Upload Signed Agreement, real (framework 4D "signed subcontractor
 * agreement", decision R5). Uploaded by an admin, so it counts as checked (V4);
 * the earlier agreement stays on file.
 */
function UploadSignedAgreement() {
  const { subcontractorId } = Route.useParams();
  const { subcontractor } = useSubcontractor(subcontractorId);
  const agreement = useAgreement(subcontractorId);
  const generateUploadUrl = useMutation(api.agreements.generateUploadUrl);
  const saveAgreement = useMutation(api.agreements.adminSave);
  const people = useResponsiblePeople();
  const navigate = useNavigate();
  const [signed, setSigned] = useState("");
  const [review, setReview] = useState("");
  const [responsible, setResponsible] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const back = { to: "/safety/subcontractors/$subcontractorId" as const, params: { subcontractorId }, search: { tab: "business" as const } };

  const save = async () => {
    const found: Errors = {};
    if (signed === "") found.signed = "Select the date the agreement was signed.";
    if (review === "") found.review = "Select the review date.";
    else if (signed !== "" && review <= signed) found.review = "The review date must be after the signing date.";
    if (file === null) found.file = "Choose the signed agreement to upload.";
    setErrors(found);
    const first = Object.values(found)[0];
    if (first || file === null) {
      toast.error(first ?? "Check the details and try again.");
      return;
    }
    setSaving(true);
    try {
      const fileId = await uploadFile(await generateUploadUrl(), file);
      await saveAgreement({
        subcontractor_id: subcontractorId as Id<"subcontractors">,
        signed_on: signed,
        review_date: review,
        responsible_user_id: responsible === "" ? undefined : (responsible as Id<"users">),
        notes: notes.trim() || undefined,
        file_id: fileId,
        file_name: file.name,
        content_type: file.type || undefined,
      });
      toast.success("Signed agreement saved");
      void navigate({ ...back, replace: true });
    } catch (caught) {
      toast.error(toUserMessage(caught, "Could not save that agreement."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafetyPage
      title="Upload Signed Agreement"
      description={subcontractor?.name ?? "Subcontractor"}
      back={{ to: back.to, label: "Business records", params: back.params }}
    >
      <FormCard title="Agreement details">
        {agreement?.current ? (
          <Notice tone="info">
            The agreement on file was signed {formatIsoDate(agreement.current.signed_on)}. It stays on file; this upload becomes the
            current one.
          </Notice>
        ) : null}
        <FieldRow>
          <Field label="Signed on" required error={errors.signed}>
            <TextInput type="date" value={signed} onChange={setSigned} invalid={!!errors.signed} />
          </Field>
          <Field label="Review date" required error={errors.review} hint="When the agreement should be checked or renewed">
            <TextInput type="date" value={review} onChange={setReview} invalid={!!errors.review} />
          </Field>
        </FieldRow>
        <Field label="Responsible person">
          <SelectInput value={responsible} onChange={setResponsible} options={people} placeholder="The admin list" />
        </Field>
        <Field label="Notes">
          <TextArea value={notes} onChange={setNotes} placeholder="Optional" />
        </Field>
        <FilePicker file={file} onChange={setFile} error={errors.file} />
        <div className="flex flex-wrap gap-3">
          <SafetyButton variant="secondary" to={back.to} params={back.params}>
            Cancel
          </SafetyButton>
          <SafetyButton onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save Agreement"}
          </SafetyButton>
        </div>
      </FormCard>
    </SafetyPage>
  );
}
