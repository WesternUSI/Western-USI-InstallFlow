import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { CheckboxRow, Field, FieldRow, FilePicker, FormCard, SelectInput, TextInput } from "@/components/whs/safety-form";
import { Notice, Panel, SafetyButton, SafetyPage } from "@/components/whs/safety-ui";
import { documentTypeLabel } from "@/lib/document-kinds";
import { toUserMessage } from "@/lib/errors";
import { uploadFile } from "@/lib/upload-file";
import { useResponsiblePeople } from "@/lib/use-people";

export const Route = createFileRoute("/_auth/safety/documents/$documentId/new-version")({
  component: UploadNewVersion,
});

type Errors = Partial<Record<"version" | "issued" | "review" | "summary" | "file", string>>;

/** A4 Upload New Version, real: the current version is superseded and kept in history (framework 4A). */
function UploadNewVersion() {
  const { documentId } = Route.useParams();
  const doc = useQuery(api.documents.adminDetail, { document_id: documentId });
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const issueVersion = useMutation(api.documents.adminIssueVersion);
  const people = useResponsiblePeople();
  const navigate = useNavigate();

  const [version, setVersion] = useState("");
  const [issued, setIssued] = useState(new Date().toISOString().slice(0, 10));
  const [review, setReview] = useState("");
  const [responsible, setResponsible] = useState("");
  const [summary, setSummary] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [requireAck, setRequireAck] = useState<boolean | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  if (doc === undefined || doc === null) {
    return (
      <SafetyPage title="Upload New Version" description="" back={{ to: "/safety/documents", label: "Safety Documents" }}>
        <Panel className="p-6 text-sm text-[#64748b]">{doc === undefined ? "Loading…" : "This document could not be found."}</Panel>
      </SafetyPage>
    );
  }
  const ack = requireAck ?? doc.acknowledgement_required;

  const publish = async () => {
    const found: Errors = {};
    if (version.trim() === "") found.version = "Enter the new version number, e.g. v2.1.";
    else if (doc.current && version.trim().toLowerCase() === doc.current.version.toLowerCase()) found.version = `${doc.current.version} is the current version. Use a new number.`;
    if (issued === "") found.issued = "Select the issue date.";
    if (review === "") found.review = "Select the review date.";
    else if (issued !== "" && review <= issued) found.review = "The review date must be after the issue date.";
    if (summary.trim() === "") found.summary = "Summarise what changed in this version.";
    if (file === null) found.file = "Choose the file for this version.";
    setErrors(found);
    const first = Object.values(found)[0];
    if (first || file === null) {
      toast.error(first ?? "Check the details and try again.");
      return;
    }
    setSaving(true);
    try {
      const fileId = await uploadFile(await generateUploadUrl(), file);
      const result = await issueVersion({
        document_id: doc.id as Id<"whs_documents">,
        version: version.trim(),
        issued,
        review_date: review,
        change_summary: summary.trim(),
        acknowledgement_required: ack,
        responsible_user_id: responsible === "" ? undefined : (responsible as Id<"users">),
        file_id: fileId,
        file_name: file.name,
        content_type: file.type || undefined,
      });
      void navigate({ replace: true, to: "/safety/documents/$documentId/published", params: { documentId }, search: { version: result.version } });
    } catch (error) {
      toast.error(toUserMessage(error, "Could not publish that version."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafetyPage
      title="Upload New Version"
      description={`${doc.title} · ${documentTypeLabel(doc.kind, doc.category)} · Western USI`}
      back={{ to: "/safety/documents/$documentId", label: "Document details", params: { documentId } }}
    >
      <FormCard title="Issue a new document version">
        <FieldRow>
          <Field label="Version" required error={errors.version}>
            <TextInput value={version} onChange={setVersion} placeholder="e.g. v2.1" invalid={!!errors.version} />
          </Field>
          <Field label="Category">
            <TextInput value={documentTypeLabel(doc.kind, doc.category)} onChange={() => undefined} />
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
        <FieldRow>
          <Field label="Who must read and sign" hint="Change it with Edit Details on the document">
            <TextInput value={doc.for_text} onChange={() => undefined} />
          </Field>
          <Field label="Responsible person" hint={doc.responsible ? `Currently ${doc.responsible}` : "Currently the admin list"}>
            <SelectInput value={responsible} onChange={setResponsible} options={people} placeholder="Keep as it is" />
          </Field>
        </FieldRow>
        <Field label="Change summary" required error={errors.summary}>
          <TextInput value={summary} onChange={setSummary} placeholder="What changed in this version?" invalid={!!errors.summary} />
        </Field>
        <FilePicker file={file} onChange={setFile} error={errors.file} />
        {doc.current ? (
          <Notice tone="info">
            Publishing supersedes {doc.current.version} automatically. Previous files and acknowledgements remain in history.
          </Notice>
        ) : null}
        <CheckboxRow checked={ack} onChange={setRequireAck}>
          Require workers to acknowledge this version
        </CheckboxRow>
        <div className="flex flex-wrap gap-3">
          <SafetyButton variant="secondary" to="/safety/documents/$documentId" params={{ documentId }}>
            Cancel
          </SafetyButton>
          <SafetyButton onClick={() => void publish()} disabled={saving}>
            {saving ? "Publishing…" : "Publish Version"}
          </SafetyButton>
        </div>
      </FormCard>
    </SafetyPage>
  );
}
