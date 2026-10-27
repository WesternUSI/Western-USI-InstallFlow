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

export const Route = createFileRoute("/_subcontractor/subcontractor/accreditations/$key/upload")({
  component: UploadWorkerEvidence,
});

type Errors = Partial<Record<"expires" | "file", string>>;

/**
 * S10 Upload renewal, S11 Upload evidence for a missing one, S12 Replace
 * requested evidence, and S26's file-too-large check, as one form (framework
 * 10: the contact uploads their workers' evidence; 8: with the new expiry
 * date). The worker and credential are fixed. The card number and dates are
 * the same fields the installer app asks for. The upload waits for Western
 * USI to verify it (decision AD50).
 */
function UploadWorkerEvidence() {
  const { key } = Route.useParams();
  const detail = useQuery(api.subcontractorPortal.accreditation, { key });
  const generateUploadUrl = useMutation(api.subcontractorPortal.generateUploadUrl);
  const upload = useMutation(api.subcontractorPortal.uploadWorkerEvidence);
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [number, setNumber] = useState("");
  const [issued, setIssued] = useState("");
  const [expires, setExpires] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});

  if (detail === undefined || detail === null) {
    return (
      <SubPage title="Upload Evidence" back={{ to: "/subcontractor/workers", label: "Our Workers" }}>
        <Panel className="p-6 text-sm text-[#64748b]">{detail === undefined ? "Loading…" : "This accreditation could not be found."}</Panel>
      </SubPage>
    );
  }
  const replacing = detail.status === "action-required";
  const title = replacing ? "Replace Requested Evidence" : detail.status === "missing" ? `Upload ${detail.type} Evidence` : `Upload ${detail.type} Renewal`;
  const back = { to: "/subcontractor/accreditations/$key", label: `${detail.type} details`, params: { key } };

  const submit = async () => {
    const found: Errors = {};
    if (issued !== "" && expires !== "" && expires <= issued) found.expires = "The expiry date must be after the issue date.";
    if (file === null) found.file = `Choose the ${detail.type} evidence to upload.`;
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
      await upload({
        worker_id: detail.worker_id,
        type_id: detail.type_id,
        file_id: fileId,
        file_name: file.name,
        content_type: file.type || undefined,
        number: number.trim() || undefined,
        issued: issued || undefined,
        expires: expires || undefined,
        notes: notes.trim() || undefined,
      });
      void navigate({ replace: true, to: "/subcontractor/accreditations/$key/submitted", params: { key } });
    } catch (caught) {
      toast.error(toUserMessage(caught, "Could not upload that evidence. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SubPage title={title} back={back}>
      {replacing && detail.evidence?.rejected_reason ? (
        <Notice tone="danger">Western USI asked for new evidence: {detail.evidence.rejected_reason}</Notice>
      ) : null}
      <FormCard title="Record details">
        <FieldRow>
          <Field label="Worker" hint="Worker and company are fixed.">
            <TextInput value={`${detail.worker} · ${detail.entity}`} onChange={() => undefined} />
          </Field>
          <Field label="Credential">
            <TextInput value={detail.type} onChange={() => undefined} />
          </Field>
        </FieldRow>
        <Field label="Card or licence number (optional)">
          <TextInput value={number} onChange={setNumber} />
        </Field>
        <FieldRow>
          <Field label="Issue date (optional)">
            <TextInput type="date" value={issued} onChange={setIssued} />
          </Field>
          <Field label="Expiry date (if any)" hint="Leave blank if it doesn't expire." error={errors.expires}>
            <TextInput type="date" value={expires} onChange={setExpires} invalid={!!errors.expires} />
          </Field>
        </FieldRow>
        <Field label={replacing ? "Response (optional)" : "Notes (optional)"}>
          <TextInput value={notes} onChange={setNotes} />
        </Field>
        <FilePicker file={file} onChange={setFile} error={errors.file} />
        <Notice tone="info">
          The evidence must belong to {detail.worker}. Western USI checks it and records the confirmed expiry. Earlier evidence is kept. You can't verify the
          upload yourself.
        </Notice>
        <div className="flex flex-wrap gap-3">
          <CancelButton to="/subcontractor/accreditations/$key" params={{ key }} />
          <SafetyButton onClick={() => void submit()} disabled={saving}>
            {saving ? "Uploading…" : replacing ? "Submit Replacement" : "Submit Evidence"}
          </SafetyButton>
        </div>
      </FormCard>
    </SubPage>
  );
}
