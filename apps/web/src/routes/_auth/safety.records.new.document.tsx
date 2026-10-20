import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { type Audience, AudiencePicker, EVERYONE, audienceError, useAudienceOptions } from "@/components/whs/audience-picker";
import { CheckboxRow, Field, FieldRow, FilePicker, FormCard, SelectInput, TextInput } from "@/components/whs/safety-form";
import { Notice, SafetyButton, SafetyPage } from "@/components/whs/safety-ui";
import { DOCUMENT_TYPE_CHOICES, OTHER_DOCUMENT_TYPE } from "@/lib/document-kinds";
import { toUserMessage } from "@/lib/errors";
import { uploadFile } from "@/lib/upload-file";
import { useResponsiblePeople } from "@/lib/use-people";

export const Route = createFileRoute("/_auth/safety/records/new/document")({
  // `for`: an entity's page this was started from ("western-usi" or a subcontractor id). It starts
  // with that company as who must sign, and returns to the company's Documents tab (decision AD42).
  validateSearch: (search: Record<string, unknown>): { for?: string } => ({
    for: typeof search.for === "string" && search.for !== "" ? search.for : undefined,
  }),
  component: AddSafetyDocument,
});

type Errors = Partial<Record<"name" | "type" | "otherType" | "version" | "issued" | "review" | "file" | "audience", string>>;

/** F2 Add Safety Document, real (framework 4A fields), with who must read and sign it (decision AD33). */
function AddSafetyDocument() {
  const navigate = useNavigate();
  const { for: forEntity } = Route.useSearch();
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const create = useMutation(api.documents.adminCreate);
  const people = useResponsiblePeople();

  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [otherType, setOtherType] = useState("");
  const [code, setCode] = useState("");
  const [appliesTo, setAppliesTo] = useState("");
  const [version, setVersion] = useState("v1.0");
  const [issued, setIssued] = useState(new Date().toISOString().slice(0, 10));
  const [review, setReview] = useState("");
  const [responsible, setResponsible] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [requireAck, setRequireAck] = useState(true);
  const [audience, setAudience] = useState<Audience>(EVERYONE);
  const { companies, companyName } = useAudienceOptions();
  const startedFor = companies.find((company) => company.id === forEntity);
  // Start with the company this was opened from ticked, once the company list has loaded.
  const [preset, setPreset] = useState(false);
  useEffect(() => {
    if (preset || startedFor === undefined) return;
    setPreset(true);
    setAudience({ mode: "some", entities: [startedFor.id], workers: [], partial: [] });
  }, [preset, startedFor]);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const found: Errors = {};
    if (name.trim() === "") found.name = "Enter the document name.";
    if (type === "") found.type = "Select the document type, or choose Other.";
    if (type === OTHER_DOCUMENT_TYPE && otherType.trim() === "") found.otherType = "Enter the name of the document type.";
    if (version.trim() === "") found.version = "Enter the version, e.g. v1.0.";
    if (issued === "") found.issued = "Select the issue date.";
    if (review === "") found.review = "Select the review date.";
    else if (issued !== "" && review <= issued) found.review = "The review date must be after the issue date.";
    if (file === null) found.file = "Choose the document to upload.";
    const audienceProblem = audienceError(audience, companyName);
    if (audienceProblem) found.audience = audienceProblem;
    setErrors(found);
    const first = Object.values(found)[0];
    if (first || file === null) {
      toast.error(first ?? "Check the details and try again.");
      return;
    }
    const chosen = DOCUMENT_TYPE_CHOICES.find((entry) => entry.value === type);
    if (!chosen) return;
    setSaving(true);
    try {
      const fileId = await uploadFile(await generateUploadUrl(), file);
      const documentId = await create({
        kind: chosen.kind,
        title: name.trim(),
        code: code.trim() || undefined,
        category: chosen.kind === "document" ? (type === OTHER_DOCUMENT_TYPE ? otherType.trim() : chosen.value) : undefined,
        applies_to: appliesTo.trim() || undefined,
        for_entities: audience.entities as ("western-usi" | Id<"subcontractors">)[],
        for_workers: audience.workers as Id<"users">[],
        acknowledgement_required: requireAck,
        responsible_user_id: responsible === "" ? undefined : (responsible as Id<"users">),
        notes: notes.trim() || undefined,
        version: version.trim(),
        issued,
        review_date: review,
        file_id: fileId,
        file_name: file.name,
        content_type: file.type || undefined,
      });
      toast.success(`${name.trim()} saved`);
      if (startedFor) {
        void navigate({ replace: true, to: "/safety/subcontractors/$subcontractorId", params: { subcontractorId: startedFor.id }, search: { tab: "documents" } });
      } else {
        void navigate({ replace: true, to: "/safety/documents/$documentId", params: { documentId } });
      }
    } catch (error) {
      toast.error(toUserMessage(error, "Could not save that document."));
    } finally {
      setSaving(false);
    }
  };

  const reminder = type === "SDS" ? "60 and 30" : "30, 14 and 7";

  return (
    <SafetyPage title="Add Safety Document" description="Create a new document record with its first evidence version." back={
        startedFor
          ? { to: "/safety/subcontractors/$subcontractorId", label: `${startedFor.name} · Documents`, params: { subcontractorId: startedFor.id }, search: { tab: "documents" } }
          : { to: "/safety/documents", label: "Safety Documents" }
      }>
      <FormCard title="Record details">
        <FieldRow>
          <Field label="Document name" required error={errors.name}>
            <TextInput value={name} onChange={setName} placeholder="e.g. Confined Space Entry" invalid={!!errors.name} />
          </Field>
          <Field label="Type" required error={errors.type}>
            <SelectInput
              value={type}
              onChange={(value) => {
                setType(value);
                setErrors((current) => ({ ...current, type: undefined, otherType: undefined }));
              }}
              options={DOCUMENT_TYPE_CHOICES}
              invalid={!!errors.type}
            />
          </Field>
        </FieldRow>
        {type === OTHER_DOCUMENT_TYPE ? (
          <Field label="Name of the document type" required error={errors.otherType} hint="Shown with the document, which appears in the app's Safety Documents.">
            <TextInput
              value={otherType}
              onChange={(value) => {
                setOtherType(value);
                setErrors((current) => ({ ...current, otherType: undefined }));
              }}
              placeholder="e.g. Hot Work Permit"
              invalid={!!errors.otherType}
            />
          </Field>
        ) : null}
        <FieldRow>
          <Field label="Document code">
            <TextInput value={code} onChange={setCode} placeholder="e.g. SWMS-08" />
          </Field>
          <Field label="Client or work type" hint="Optional. Shown to workers with the document.">
            <TextInput value={appliesTo} onChange={setAppliesTo} placeholder="e.g. JCDecaux sites" />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Version" required error={errors.version}>
            <TextInput value={version} onChange={setVersion} invalid={!!errors.version} />
          </Field>
          <Field label="Responsible person">
            <SelectInput value={responsible} onChange={setResponsible} options={people} placeholder="The admin list" />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Issue date" required error={errors.issued}>
            <TextInput type="date" value={issued} onChange={setIssued} invalid={!!errors.issued} />
          </Field>
          <Field label="Review date" required error={errors.review}>
            <TextInput type="date" value={review} onChange={setReview} invalid={!!errors.review} />
          </Field>
        </FieldRow>
        <Field label="Notes">
          <TextInput value={notes} onChange={setNotes} placeholder="Optional" />
        </Field>
        <FilePicker file={file} onChange={setFile} error={errors.file} />
        <AudiencePicker
          value={audience}
          onChange={(next) => {
            setAudience(next);
            setErrors((current) => ({ ...current, audience: undefined }));
          }}
          error={errors.audience}
        />
        <Notice tone="info">Status is calculated automatically. Reminders default to {reminder} days before review, then weekly once overdue.</Notice>
        <CheckboxRow checked={requireAck} onChange={setRequireAck}>
          Require acknowledgement from workers
        </CheckboxRow>
        <div className="flex flex-wrap gap-3">
          <SafetyButton variant="secondary" to="/safety/records/new">
            Cancel
          </SafetyButton>
          <SafetyButton onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save Document"}
          </SafetyButton>
        </div>
      </FormCard>
    </SafetyPage>
  );
}
