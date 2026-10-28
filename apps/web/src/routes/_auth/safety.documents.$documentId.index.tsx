import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { cn } from "@usi-installer/ui/lib/utils";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Mail, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { type Audience, AudiencePicker, audienceError, savedAudience, useAudienceOptions } from "@/components/whs/audience-picker";
import { DetailsLayout, EvidencePreview, SideButton, SideCard } from "@/components/whs/record-cards";
import { ArchivedNotice, EditRecordDialog, ManageRecordCard } from "@/components/whs/record-admin";
import { ReasonDialog } from "@/components/whs/reason-dialog";
import { CheckboxRow, Field, FieldRow, SelectInput, TextArea, TextInput } from "@/components/whs/safety-form";
import { DetailGrid, Panel, SafetyButton, SafetyPage, StatusBadge, TableFooter, reminderText } from "@/components/whs/safety-ui";
import { DOCUMENT_TYPES, OTHER_DOCUMENT_TYPE, documentTypeLabel, reviewReminderDays } from "@/lib/document-kinds";
import { toUserMessage } from "@/lib/errors";
import { formatIsoDate, formatTime } from "@/lib/upload-file";
import { useResponsiblePeople } from "@/lib/use-people";
import { useRegister } from "@/lib/use-register";

export const Route = createFileRoute("/_auth/safety/documents/$documentId/")({
  component: DocumentDetails,
});

const ACK_PAGE_SIZE = 20;

const CHANGE_STATE: Record<string, { label: string; className: string }> = {
  "awaiting-review": { label: "Awaiting review", className: "bg-[#fcfcdc] text-[#bb7e23]" },
  validated: { label: "Validated", className: "bg-[#dcfce7] text-[#166534]" },
  "sent-back": { label: "Sent back", className: "bg-[#fcdcdd] text-[#b71d1f]" },
};

/** A3 Document details, real data (framework 4A, decisions D1–D3). */
function DocumentDetails() {
  const { documentId } = Route.useParams();
  const doc = useQuery(api.documents.adminDetail, { document_id: documentId });
  const register = useRegister();
  const row = register?.rows.find((entry) => entry.id === documentId);
  const archive = useMutation(api.documents.adminArchive);
  const [editing, setEditing] = useState(false);
  // The acknowledgements table shows 20 workers a page.
  const [ackPage, setAckPage] = useState(1);

  if (doc === undefined || doc === null) {
    return (
      <SafetyPage title="Document" description="" back={{ to: "/safety/documents", label: "Safety Documents" }}>
        <Panel className="p-6 text-sm text-[#64748b]">{doc === undefined ? "Loading…" : "This document could not be found."}</Panel>
      </SafetyPage>
    );
  }

  const acknowledged = doc.acknowledgements.filter((ack) => ack.acknowledged_at !== undefined).length;
  const ackPages = Math.max(1, Math.ceil(doc.acknowledgements.length / ACK_PAGE_SIZE));
  const type = documentTypeLabel(doc.kind, doc.category);

  return (
    <SafetyPage title={doc.title} description={[doc.code, type, "Western USI"].filter(Boolean).join(" · ")} back={{ to: "/safety/documents", label: "Safety Documents" }}>
      {doc.archived ? <ArchivedNotice noun="document" /> : null}
      <DetailsLayout
        main={
          <>
            <Panel className="flex flex-col gap-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold text-[#111827]">Document details</h2>
                {row ? <StatusBadge status={row.status} /> : null}
              </div>
              <DetailGrid
                columns={2}
                items={[
                  { label: "Version", value: doc.current?.version ?? "—" },
                  { label: "Category", value: type },
                  { label: "Who must read and sign", value: doc.for_text },
                  { label: "Client or work type", value: doc.applies_to ?? "—" },
                  { label: "Issue date", value: formatIsoDate(doc.current?.issued) },
                  { label: "Review date", value: formatIsoDate(doc.current?.review_date) },
                  { label: "Responsible person", value: doc.responsible ?? "The admin list" },
                  { label: "Acknowledgement", value: doc.acknowledgement_required ? "Required" : "Not required" },
                  { label: "Previous versions", value: doc.history.length === 0 ? "None" : doc.history.map((entry) => entry.version).join(", ") },
                  { label: "Reminders", value: reminderText(reviewReminderDays(doc.kind), "review") },
                ]}
              />
              {doc.notes ? <DetailGrid columns={2} items={[{ label: "Notes", value: doc.notes }]} /> : null}
            </Panel>

            {doc.acknowledgement_required ? (
              <Panel className="flex flex-col gap-4 py-6">
                <div className="flex items-center justify-between px-6">
                  <h3 className="text-base font-bold text-[#0f172a]">Acknowledgements - {doc.current?.version}</h3>
                  <span className={cn("text-xs font-semibold", acknowledged === doc.acknowledgements.length ? "text-[#16a34a]" : "text-[#dc2626]")}>
                    {acknowledged} of {doc.acknowledgements.length} acknowledged
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="border-y border-[#f1f5f9] bg-[#f8fafc]/80">
                      <tr>
                        {["Worker", "Entity", "Status"].map((heading) => (
                          <th key={heading} className="px-3 py-2.5 text-[10px] font-bold tracking-[0.5px] text-[#94a3b8] uppercase first:pl-6">
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {doc.acknowledgements.slice((Math.min(ackPage, ackPages) - 1) * ACK_PAGE_SIZE, Math.min(ackPage, ackPages) * ACK_PAGE_SIZE).map((ack) => (
                        <tr key={`${ack.worker}-${ack.entity}`} className="border-t border-[#f1f5f9] first:border-t-0">
                          <td className="py-3 pr-3 pl-6 text-xs font-semibold text-[#1e293b]">{ack.worker}</td>
                          <td className="px-3 py-3 text-xs text-[#475569]">{ack.entity}</td>
                          <td className="px-3 py-2.5">
                            <span
                              className={cn(
                                "inline-flex rounded-[4px] px-2.5 py-0.5 text-[11px] font-medium",
                                ack.acknowledged_at ? "bg-[#def7ec] text-[#046c4e]" : "bg-[#fde8e8] text-[#e02424]",
                              )}
                            >
                              {ack.acknowledged_at ? `Acknowledged ${formatTime(ack.acknowledged_at)}` : "Outstanding"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TableFooter page={Math.min(ackPage, ackPages)} pageSize={ACK_PAGE_SIZE} total={doc.acknowledgements.length} noun="workers" onPage={setAckPage} />
                {acknowledged < doc.acknowledgements.length && doc.can_manage ? (
                  <div className="px-6 pt-1">
                    <SafetyButton
                      variant="secondary"
                      to="/safety/documents/$documentId/remind"
                      params={{ documentId: doc.id }}
                      className="h-auto rounded-[8px] border-[#3b82f6] px-[15px] py-[9px] text-xs"
                    >
                      <Mail className="size-3.5" />
                      Send Reminder to Outstanding Workers
                    </SafetyButton>
                  </div>
                ) : null}
              </Panel>
            ) : null}

            {doc.kind === "swms" ? <ChangesCard changes={doc.changes} canManage={doc.can_manage} /> : null}

            {doc.concerns.length > 0 ? (
              <Panel className="flex flex-col gap-3 p-6">
                <h3 className="text-base font-semibold text-[#111827]">Concerns and questions</h3>
                {doc.concerns.map((concern) => (
                  <div key={concern.at} className="rounded-[8px] border border-[#f1f5f9] p-3">
                    <p className="text-xs text-[#64748b]">
                      {formatTime(concern.at)} · {concern.by}
                    </p>
                    <p className="mt-1 text-[13px] text-[#111827]">{concern.message}</p>
                  </div>
                ))}
              </Panel>
            ) : null}

            <Panel className="flex flex-col gap-4 p-6">
              <h3 className="text-base font-semibold text-[#111827]">Recent activity</h3>
              {doc.activity.length === 0 ? <p className="text-xs text-[#64748b]">Nothing recorded yet.</p> : null}
              {doc.activity.map((entry) => (
                <p key={`${entry.at}-${entry.text}`} className="text-xs text-[#64748b]">
                  {formatTime(entry.at)} · {entry.text}
                  {entry.by ? ` by ${entry.by}` : ""}
                  {entry.details ? ` · ${entry.details}` : ""}
                </p>
              ))}
            </Panel>
          </>
        }
        side={
          <>
            <SideCard title="Evidence">
              <EvidencePreview fileName={doc.current?.file_name ?? "No file"} />
              {doc.current?.url ? <SideButton onClick={() => window.open(doc.current?.url ?? "", "_blank", "noopener")}>Open Document</SideButton> : null}
              {doc.can_manage ? (
                <SafetyButton
                  variant="secondary"
                  to="/safety/documents/$documentId/new-version"
                  params={{ documentId: doc.id }}
                  className="h-auto rounded-[8px] border-[#3b82f6] py-[11px] text-xs"
                >
                  <Upload className="size-3.5" />
                  Upload New Version
                </SafetyButton>
              ) : null}
            </SideCard>
            {doc.can_manage ? (
              <ManageRecordCard
                noun="document"
                onEdit={() => setEditing(true)}
                onArchive={async (reason) => {
                  try {
                    await archive({ document_id: doc.id, reason });
                    toast.success(`${doc.title} archived`);
                  } catch (error) {
                    toast.error(toUserMessage(error, "Could not archive that document."));
                    throw error;
                  }
                }}
              />
            ) : null}
          </>
        }
      />
      {doc.can_manage ? <EditDocumentDialog doc={doc} open={editing} onClose={() => setEditing(false)} /> : null}
    </SafetyPage>
  );
}

type Change = NonNullable<FunctionReturnType<typeof api.documents.adminDetail>>["changes"][number];

/** On-site changes to this SWMS version (decision D3): the admin validates them or sends them back with a reason. */
function ChangesCard({ changes, canManage }: { changes: Change[]; canManage: boolean }) {
  const validate = useMutation(api.documents.validateChange);
  const sendBack = useMutation(api.documents.sendBackChange);
  const [sendingBack, setSendingBack] = useState<Id<"swms_changes"> | null>(null);

  const handleValidate = async (id: Id<"swms_changes">) => {
    try {
      await validate({ change_id: id });
      toast.success("On-site change validated");
    } catch (error) {
      toast.error(toUserMessage(error, "Could not validate that change."));
    }
  };

  const handleSendBack = async (reason: string) => {
    if (sendingBack === null) return;
    try {
      await sendBack({ change_id: sendingBack, reason });
      toast.success("Change sent back", { description: "The worker who recorded it has been emailed." });
    } catch (error) {
      toast.error(toUserMessage(error, "Could not send that change back."));
      throw error;
    }
  };

  return (
    <Panel className="flex flex-col gap-3 p-6">
      <ReasonDialog
        open={sendingBack !== null}
        title="Send this change back"
        description="The worker who recorded it is emailed with your reason, and the change shows as Sent back."
        placeholder="e.g. The control doesn't address the traffic risk; brief the crew on a spotter and record it again."
        confirmLabel="Send Back"
        missingMessage="Enter a reason, so the worker knows what to change."
        onClose={() => setSendingBack(null)}
        onConfirm={handleSendBack}
      />
      <h3 className="text-base font-semibold text-[#111827]">On-site changes</h3>
      {changes.length === 0 ? <p className="text-xs text-[#64748b]">No on-site changes recorded against this version.</p> : null}
      {changes.map((change) => (
        <div key={change.id} className="flex flex-col gap-2 rounded-[8px] border border-[#f1f5f9] p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] font-semibold text-[#111827]">{change.change}</p>
            <span className={cn("inline-flex shrink-0 rounded-[4px] px-2 py-0.5 text-[11px] font-medium", CHANGE_STATE[change.state]?.className)}>
              {CHANGE_STATE[change.state]?.label}
            </span>
          </div>
          <p className="text-xs text-[#64748b]">
            {formatIsoDate(change.date)} {change.time} · {change.reported_by}
            {change.site ? ` · ${change.site}` : ""} · Risk {change.risk_before} → {change.risk_after} · Approved / briefed by {change.approved_by} ·{" "}
            {change.signoffs} signed
          </p>
          <p className="text-xs text-[#475569]">Control: {change.control}</p>
          {change.state === "sent-back" && change.review_reason ? <p className="text-xs text-[#b91c1c]">Sent back: {change.review_reason}</p> : null}
          {change.state === "awaiting-review" && canManage ? (
            <div className="flex gap-2">
              <SafetyButton className="h-9" onClick={() => void handleValidate(change.id)}>
                Validate
              </SafetyButton>
              <SafetyButton variant="secondary" className="h-9" onClick={() => setSendingBack(change.id)}>
                Send Back
              </SafetyButton>
            </div>
          ) : null}
        </div>
      ))}
    </Panel>
  );
}

type DocumentDetail = NonNullable<FunctionReturnType<typeof api.documents.adminDetail>>;

/** Edit Details for a document (decisions AD32, AD33): its details, who must sign it, and the current review date. */
function EditDocumentDialog({ doc, open, onClose }: { doc: DocumentDetail; open: boolean; onClose: () => void }) {
  const edit = useMutation(api.documents.adminEdit);
  const people = useResponsiblePeople();
  const [title, setTitle] = useState(doc.title);
  // A type from the list, or "other" with its typed name (decision AD40).
  const listed = (value: string | undefined) => DOCUMENT_TYPES.some((entry) => entry.kind === "document" && entry.value === value);
  const [category, setCategory] = useState(listed(doc.category) || !doc.category ? (doc.category ?? "") : OTHER_DOCUMENT_TYPE);
  const [otherCategory, setOtherCategory] = useState(listed(doc.category) ? "" : (doc.category ?? ""));
  const [appliesTo, setAppliesTo] = useState(doc.applies_to ?? "");
  const [audience, setAudience] = useState<Audience>(savedAudience(doc.for_entities, doc.for_workers, doc.office_only));
  const { companyName } = useAudienceOptions();
  const [requireAck, setRequireAck] = useState(doc.acknowledgement_required);
  const [responsible, setResponsible] = useState<string>(doc.responsible_id ?? "");
  const [review, setReview] = useState(doc.current?.review_date ?? "");
  const [notes, setNotes] = useState(doc.notes ?? "");
  const [errors, setErrors] = useState<{ title?: string; review?: string; audience?: string; category?: string }>({});
  const [openedAt, setOpenedAt] = useState(false);

  // Start from the saved values each time it opens.
  if (open && !openedAt) {
    setOpenedAt(true);
    setTitle(doc.title);
    setCategory(listed(doc.category) || !doc.category ? (doc.category ?? "") : OTHER_DOCUMENT_TYPE);
    setOtherCategory(listed(doc.category) ? "" : (doc.category ?? ""));
    setAppliesTo(doc.applies_to ?? "");
    setAudience(savedAudience(doc.for_entities, doc.for_workers, doc.office_only));
    setRequireAck(doc.acknowledgement_required);
    setResponsible(doc.responsible_id ?? "");
    setReview(doc.current?.review_date ?? "");
    setNotes(doc.notes ?? "");
    setErrors({});
  } else if (!open && openedAt) {
    setOpenedAt(false);
  }

  const save = async (reason: string) => {
    const found: typeof errors = {};
    if (title.trim() === "") found.title = "Enter the document name";
    if (doc.kind === "document" && category === OTHER_DOCUMENT_TYPE && otherCategory.trim() === "") found.category = "Enter the name of the document type";
    if (doc.current && review !== "" && review <= doc.current.issued) found.review = "The review date must be after the issue date";
    const audienceProblem = audienceError(audience, companyName);
    if (audienceProblem) found.audience = audienceProblem;
    setErrors(found);
    const first = Object.values(found)[0];
    if (first) {
      toast.error(first);
      return false;
    }
    try {
      await edit({
        document_id: doc.id,
        title: title.trim(),
        category: doc.kind === "document" ? (category === OTHER_DOCUMENT_TYPE ? otherCategory.trim() : category || undefined) : doc.category,
        applies_to: appliesTo.trim() || undefined,
        for_entities: audience.entities as ("western-usi" | Id<"subcontractors">)[],
        for_workers: audience.workers as Id<"users">[],
        office_only: audience.mode === "office",
        acknowledgement_required: requireAck && audience.mode !== "office",
        responsible_user_id: responsible === "" ? null : (responsible as Id<"users">),
        notes: notes.trim() || undefined,
        review_date: review || undefined,
        reason,
      });
      toast.success("Changes saved");
      return true;
    } catch (error) {
      toast.error(toUserMessage(error, "Could not save those changes."));
      return false;
    }
  };

  return (
    <EditRecordDialog open={open} title={`Edit ${doc.title}`} onClose={onClose} onSave={save}>
      <FieldRow>
        <Field label="Document name" required error={errors.title}>
          <TextInput value={title} onChange={setTitle} invalid={!!errors.title} />
        </Field>
        {doc.kind === "document" ? (
          <Field label="Type">
            <SelectInput
              value={category}
              onChange={setCategory}
              options={[
                ...DOCUMENT_TYPES.filter((entry) => entry.kind === "document"),
                { value: OTHER_DOCUMENT_TYPE, label: "Other (type the name)" },
              ]}
              placeholder="Safety document"
            />
          </Field>
        ) : (
          <Field label="Client or work type">
            <TextInput value={appliesTo} onChange={setAppliesTo} placeholder="e.g. JCDecaux sites" />
          </Field>
        )}
      </FieldRow>
      {doc.kind === "document" ? (
        <Field label="Client or work type">
          <TextInput value={appliesTo} onChange={setAppliesTo} placeholder="e.g. JCDecaux sites" />
        </Field>
      ) : null}
      {doc.kind === "document" && category === OTHER_DOCUMENT_TYPE ? (
        <Field label="Name of the document type" required error={errors.category}>
          <TextInput
            value={otherCategory}
            onChange={(value) => {
              setOtherCategory(value);
              setErrors((current) => ({ ...current, category: undefined }));
            }}
            placeholder="e.g. Hot Work Permit"
            invalid={!!errors.category}
          />
        </Field>
      ) : null}
      <AudiencePicker
        value={audience}
        onChange={(next) => {
          setAudience(next);
          setErrors((current) => ({ ...current, audience: undefined }));
        }}
        error={errors.audience}
      />
      {audience.mode === "office" ? null : (
        <CheckboxRow checked={requireAck} onChange={setRequireAck}>
          Require acknowledgement from workers
        </CheckboxRow>
      )}
      <FieldRow>
        <Field label="Review date" error={errors.review}>
          <TextInput type="date" value={review} onChange={setReview} invalid={!!errors.review} />
        </Field>
        <Field label="Responsible person">
          <SelectInput value={responsible} onChange={setResponsible} options={people} placeholder="The admin list" />
        </Field>
      </FieldRow>
      <Field label="Notes">
        <TextArea value={notes} onChange={setNotes} placeholder="Optional" />
      </Field>
    </EditRecordDialog>
  );
}
