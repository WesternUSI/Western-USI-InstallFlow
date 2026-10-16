import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@usi-installer/ui/components/dialog";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DetailsLayout, EvidencePreview, SideButton, SideCard } from "@/components/whs/record-cards";
import { ReasonDialog } from "@/components/whs/reason-dialog";
import { EditRecordDialog, ManageRecordCard } from "@/components/whs/record-admin";
import { CheckboxRow, Field, FieldRow, FilePicker, TextArea, TextInput } from "@/components/whs/safety-form";
import { DetailGrid, Notice, Panel, SafetyButton, SafetyPage, StatusBadge, reminderText } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";
import { formatIsoDate, formatTime, uploadFile } from "@/lib/upload-file";

export const Route = createFileRoute("/_auth/safety/accreditations/$accreditationId")({
  component: ReviewEvidence,
});

const ACTION_TEXT: Record<string, string> = {
  uploaded: "Evidence uploaded",
  verified: "Verified",
  rejected: "New evidence requested",
  superseded: "Replaced by a newer upload",
  reminder_sent: "Reminder sent",
  escalated: "Escalated to management",
  edited: "Details changed",
};

/**
 * B3/B4 Review Evidence, real data. The admin verifies (framework 8, V1) and
 * can add the expiry while verifying (S6), or requests new evidence with a
 * reason (S3). For a Missing one, or to replace evidence, the admin adds it
 * for the worker; it is recorded as verified by them (V4).
 */
function ReviewEvidence() {
  const { accreditationId } = Route.useParams();
  const detail = useQuery(api.accreditations.adminDetail, { key: accreditationId });
  const verify = useMutation(api.accreditations.verify);
  const reject = useMutation(api.accreditations.reject);
  const [expires, setExpires] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  if (detail === undefined || detail === null) {
    return (
      <SafetyPage title="Review Evidence" description="" back={{ to: "/safety/register", label: "WHS & Compliance Register" }}>
        <Panel className="p-6 text-sm text-[#64748b]">{detail === undefined ? "Loading…" : "This accreditation could not be found."}</Panel>
      </SafetyPage>
    );
  }

  const evidence = detail.evidence;
  const waiting = detail.pending_version_id !== undefined;

  const handleVerify = async () => {
    if (!detail.pending_version_id) return;
    setBusy(true);
    try {
      await verify({ version_id: detail.pending_version_id, expires: expires || undefined });
      toast.success(`${detail.type} verified`, { description: `${detail.worker} has been emailed.` });
      setExpires("");
    } catch (error) {
      toast.error(toUserMessage(error, "Could not verify that evidence."));
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!detail.pending_version_id) return;
    try {
      await reject({ version_id: detail.pending_version_id, reason });
      toast.success("Request sent to the worker", { description: "They see it as Action required and get an email." });
    } catch (error) {
      toast.error(toUserMessage(error, "Could not send that request."));
      throw error;
    }
  };

  return (
    <SafetyPage
      title="Review Evidence"
      description={`${detail.type} · ${detail.worker} · ${detail.entity}`}
      back={{ to: "/safety/register", label: "WHS & Compliance Register" }}
    >
      <AddEvidenceDialog
        open={adding}
        workerId={detail.worker_id}
        typeId={detail.type_id}
        worker={detail.worker}
        type={detail.type}
        onClose={() => setAdding(false)}
      />
      <ReasonDialog
        open={requesting}
        title="Request new evidence"
        description={`${detail.worker} will see the ${detail.type} as Action required, with your reason, and get an email.`}
        placeholder="e.g. The card is blurry; upload a clearer photo of both sides."
        confirmLabel="Send Request"
        missingMessage="Enter a reason, so the worker knows what to fix."
        onClose={() => setRequesting(false)}
        onConfirm={handleReject}
      />
      <DetailsLayout
        main={
          <>
            <Panel className="flex flex-col gap-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold text-[#111827]">Accreditation details</h2>
                <StatusBadge status={detail.status} />
              </div>
              <DetailGrid
                columns={2}
                items={[
                  { label: "Worker", value: detail.worker },
                  { label: "Entity", value: detail.entity },
                  { label: "Accreditation", value: detail.type },
                  { label: "Card number", value: evidence?.number ?? "—" },
                  { label: "Issue date", value: formatIsoDate(evidence?.issued) },
                  { label: "Expiry date", value: evidence ? (evidence.no_expiry ? "No expiry entered" : formatIsoDate(evidence.expires)) : "—" },
                  { label: "Uploaded by", value: evidence ? `${evidence.uploaded_by ?? "—"} · ${formatTime(evidence.uploaded_at)}` : "—" },
                  { label: "Verified by", value: evidence?.verified_by ? `${evidence.verified_by} · ${formatTime(evidence.verified_at)}` : "—" },
                  { label: "Reminders", value: reminderText(detail.reminder_days, "expiry") },
                ]}
              />
              {evidence?.notes ? <DetailGrid columns={2} items={[{ label: "Notes", value: evidence.notes }]} /> : null}
              {waiting && detail.can_verify ? (
                <Field
                  label={evidence?.no_expiry ? "Expiry date (add it if the document shows one)" : "Correct the expiry date (optional)"}
                  className="max-w-xs"
                >
                  <TextInput type="date" value={expires} onChange={setExpires} />
                </Field>
              ) : null}
            </Panel>

            {detail.status === "action-required" && evidence?.rejected_reason ? (
              <Notice tone="danger">New evidence requested: {evidence.rejected_reason}. The worker sees this as Action required.</Notice>
            ) : null}
            {detail.status === "missing" ? <Notice tone="warning">{detail.worker} hasn't uploaded this yet. You can add it for them.</Notice> : null}

            {waiting ? (
              <Panel className="flex flex-col gap-3 p-6">
                <h3 className="text-base font-semibold text-[#111827]">Review checklist</h3>
                <p className="text-[13px] text-[#64748b]">
                  Check the worker’s identity, accreditation type, legibility and dates against the uploaded document. Record verification
                  against this exact evidence version.
                </p>
              </Panel>
            ) : null}



            <Panel className="flex flex-col gap-4 p-6">
              <h3 className="text-base font-semibold text-[#111827]">Recent activity</h3>
              {detail.activity.length === 0 ? <p className="text-xs text-[#64748b]">Nothing recorded yet.</p> : null}
              {detail.activity.map((entry) => (
                <p key={`${entry.at}-${entry.action}`} className="text-xs text-[#64748b]">
                  {formatTime(entry.at)} · {ACTION_TEXT[entry.action] ?? entry.action}
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
              <EvidencePreview fileName={evidence?.file_name ?? "No evidence uploaded"} />
              {detail.status === "current" ? (
                <p className="rounded-[8px] bg-[#f0fdf4] py-[11px] text-center text-xs font-semibold text-[#15803d]">Evidence Verified</p>
              ) : null}
              {evidence?.url ? (
                <SideButton onClick={() => window.open(evidence.url ?? "", "_blank", "noopener")}>Open Evidence</SideButton>
              ) : null}
              {waiting && detail.can_verify ? (
                <>
                  <SideButton filled onClick={() => void handleVerify()} disabled={busy}>
                    Verify Evidence
                  </SideButton>
                  <SideButton onClick={() => setRequesting(true)}>Request New Evidence</SideButton>
                </>
              ) : null}
              {waiting && !detail.can_verify ? (
                <p className="text-center text-xs text-[#64748b]">Only an administrator can verify evidence.</p>
              ) : null}
              {!waiting && detail.can_verify ? (
                <SideButton filled={detail.status === "missing"} onClick={() => setAdding(true)}>
                  {detail.status === "missing" ? "Add Evidence" : "Add New Evidence"}
                </SideButton>
              ) : null}
            </SideCard>
            {/* Verified evidence is corrected here; waiting evidence is corrected while verifying it (S6). */}
            {!waiting && detail.can_verify && evidence?.state === "verified" && detail.record_id ? (
              <ManageRecordCard noun="accreditation" onEdit={() => setEditing(true)} />
            ) : null}
          </>
        }
      />
      {!waiting && detail.can_verify && evidence?.state === "verified" && detail.record_id ? (
        <EditEvidenceDialog
          recordId={detail.record_id}
          title={`Edit ${detail.type} · ${detail.worker}`}
          evidence={evidence}
          open={editing}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </SafetyPage>
  );
}

type EvidenceErrors = Partial<Record<"issued" | "expires", string>>;

/** Edit Details for verified evidence (decision AD32): card number, dates and notes, with a reason. */
function EditEvidenceDialog({
  recordId,
  title,
  evidence,
  open,
  onClose,
}: {
  recordId: Id<"whs_records">;
  title: string;
  evidence: { number?: string; issued?: string; expires?: string; no_expiry: boolean; notes?: string };
  open: boolean;
  onClose: () => void;
}) {
  const edit = useMutation(api.accreditations.adminEdit);
  const initial = () => ({
    number: evidence.number ?? "",
    issued: evidence.issued ?? "",
    expires: evidence.expires ?? "",
    noExpiry: evidence.no_expiry,
    notes: evidence.notes ?? "",
  });
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<EvidenceErrors>({});
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(initial());
      setErrors({});
    }
  }

  const save = async (reason: string) => {
    const found: EvidenceErrors = {};
    if (!form.noExpiry && form.expires === "") found.expires = "Select the expiry date, or tick that it doesn't expire";
    else if (!form.noExpiry && form.issued !== "" && form.expires <= form.issued) found.expires = "The expiry date must be after the issue date";
    setErrors(found);
    const first = Object.values(found)[0];
    if (first) {
      toast.error(first);
      return false;
    }
    try {
      await edit({
        record_id: recordId,
        number: form.number.trim() || undefined,
        issued: form.issued || undefined,
        expires: form.noExpiry ? undefined : form.expires,
        no_expiry: form.noExpiry,
        notes: form.notes.trim() || undefined,
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
    <EditRecordDialog open={open} title={title} onClose={onClose} onSave={save}>
      <Field label="Card or licence number">
        <TextInput value={form.number} onChange={(value) => setForm({ ...form, number: value })} />
      </Field>
      <FieldRow>
        <Field label="Issue date" error={errors.issued}>
          <TextInput type="date" value={form.issued} onChange={(value) => setForm({ ...form, issued: value })} invalid={!!errors.issued} />
        </Field>
        <Field label="Expiry date" required={!form.noExpiry} error={errors.expires}>
          <TextInput
            type="date"
            value={form.noExpiry ? "" : form.expires}
            onChange={(value) => setForm({ ...form, expires: value })}
            invalid={!!errors.expires}
          />
        </Field>
      </FieldRow>
      <CheckboxRow checked={form.noExpiry} onChange={(checked) => setForm({ ...form, noExpiry: checked })}>
        It doesn't expire
      </CheckboxRow>
      <Field label="Notes">
        <TextArea value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} placeholder="Optional" />
      </Field>
    </EditRecordDialog>
  );
}

/** The admin adds evidence for the worker, in a dialog; recorded as verified by them (V4). */
function AddEvidenceDialog({
  open,
  workerId,
  typeId,
  worker,
  type,
  onClose,
}: {
  open: boolean;
  workerId: Id<"users">;
  typeId: Id<"accreditation_types">;
  worker: string;
  type: string;
  onClose: () => void;
}) {
  const generateUploadUrl = useMutation(api.accreditations.generateUploadUrl);
  const addEvidence = useMutation(api.accreditations.adminAddEvidence);
  const [file, setFile] = useState<File | null>(null);
  const [number, setNumber] = useState("");
  const [issued, setIssued] = useState("");
  const [expires, setExpires] = useState("");
  const [errors, setErrors] = useState<{ file?: string; expires?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFile(null);
      setNumber("");
      setIssued("");
      setExpires("");
      setErrors({});
    }
  }, [open]);

  const save = async () => {
    const found: typeof errors = {};
    if (file === null) found.file = `Choose the ${type} evidence to upload.`;
    if (issued && expires && expires < issued) found.expires = "The expiry date can't be before the issue date.";
    setErrors(found);
    const first = found.file ?? found.expires;
    if (first || file === null) {
      toast.error(first ?? "Check the details and try again.");
      return;
    }
    setSaving(true);
    try {
      const fileId = await uploadFile(await generateUploadUrl(), file);
      await addEvidence({
        worker_id: workerId,
        type_id: typeId,
        file_id: fileId,
        file_name: file.name,
        content_type: file.type || undefined,
        number: number.trim() || undefined,
        issued: issued || undefined,
        expires: expires || undefined,
      });
      toast.success(`${type} added for ${worker}`);
      onClose();
    } catch (error) {
      toast.error(toUserMessage(error, "Could not add that evidence."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-xl border-slate-200 bg-white sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900">Add evidence for {worker}</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            {type}. Evidence you add is recorded as verified by you, and any earlier upload is kept in history.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
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
        </div>
        <DialogFooter>
          <SafetyButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </SafetyButton>
          <SafetyButton onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save Evidence"}
          </SafetyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
