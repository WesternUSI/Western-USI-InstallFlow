import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@usi-installer/ui/components/dialog";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { ReasonDialog } from "@/components/whs/reason-dialog";
import { Field, FilePicker, TextInput } from "@/components/whs/safety-form";
import { Panel, RowAction, SafetyButton } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";
import { formatTime, uploadFile } from "@/lib/upload-file";

interface VehicleDocument {
  id: Id<"vehicle_documents">;
  name: string;
  file_name: string;
  url: string | null;
  uploaded_at: number;
  by?: string;
}

/**
 * A vehicle's documents, e.g. its registration papers (decision AD56). The
 * admin uploads and deletes them; management sees them read-only.
 */
export function VehicleDocumentsPanel({
  vehicleId,
  registration,
  documents,
  canManage,
}: {
  vehicleId: Id<"vehicles">;
  registration: string;
  documents: VehicleDocument[];
  canManage: boolean;
}) {
  const remove = useMutation(api.vehicles.adminDeleteDocument);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<VehicleDocument | null>(null);

  const handleDelete = async (reason: string) => {
    if (deleting === null) return;
    try {
      await remove({ document_id: deleting.id, reason });
      toast.success(`${deleting.name} deleted`);
    } catch (error) {
      toast.error(toUserMessage(error, "Could not delete that document."));
      throw error;
    }
  };

  return (
    <Panel className="flex flex-col gap-3 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-[#111827]">Documents</h3>
        {canManage ? (
          <SafetyButton variant="secondary" onClick={() => setAdding(true)} className="h-9 text-xs">
            + Upload Document
          </SafetyButton>
        ) : null}
      </div>
      {documents.length === 0 ? <p className="text-xs text-[#64748b]">No documents yet, e.g. registration papers.</p> : null}
      {documents.map((document) => (
        <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f1f5f9] pt-3 first-of-type:border-t-0">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[#111827]">{document.name}</p>
            <p className="text-xs text-[#64748b]">
              {document.file_name} · {formatTime(document.uploaded_at)}
              {document.by ? ` by ${document.by}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            {document.url ? <RowAction onClick={() => window.open(document.url ?? "", "_blank", "noopener")}>Open</RowAction> : null}
            {canManage ? <RowAction onClick={() => setDeleting(document)}>Delete</RowAction> : null}
          </div>
        </div>
      ))}
      {canManage ? <UploadDocumentDialog vehicleId={vehicleId} registration={registration} open={adding} onClose={() => setAdding(false)} /> : null}
      <ReasonDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "this document"}?`}
        description={`It disappears from ${registration}'s documents. It's kept in the vehicle's activity with your reason, never wiped.`}
        placeholder="e.g. Uploaded to the wrong vehicle"
        confirmLabel="Delete"
        missingMessage="Enter the reason for deleting it"
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </Panel>
  );
}

type UploadErrors = Partial<Record<"name" | "file", string>>;

function UploadDocumentDialog({
  vehicleId,
  registration,
  open,
  onClose,
}: {
  vehicleId: Id<"vehicles">;
  registration: string;
  open: boolean;
  onClose: () => void;
}) {
  const generateUploadUrl = useMutation(api.vehicles.generateUploadUrl);
  const add = useMutation(api.vehicles.adminAddDocument);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<UploadErrors>({});
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setFile(null);
      setErrors({});
    }
  }

  const save = async () => {
    const found: UploadErrors = {};
    if (name.trim() === "") found.name = "Enter the document name, e.g. Registration papers 2026.";
    if (file === null) found.file = "Choose the document to upload.";
    setErrors(found);
    const first = Object.values(found)[0];
    if (first || file === null) {
      toast.error(first ?? "Check the details and try again.");
      return;
    }
    setSaving(true);
    try {
      const fileId = await uploadFile(await generateUploadUrl(), file);
      await add({ vehicle_id: vehicleId, name: name.trim(), file_id: fileId, file_name: file.name, content_type: file.type || undefined });
      toast.success(`${name.trim()} saved to ${registration}`);
      onClose();
    } catch (error) {
      toast.error(toUserMessage(error, "Could not save that document."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="rounded-xl border-slate-200 bg-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900">Upload a document to {registration}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-500">
            For papers kept with the vehicle, like its registration. Service reports go on Mark Service Complete.
          </DialogDescription>
        </DialogHeader>
        <Field label="Document name" required error={errors.name}>
          <TextInput
            value={name}
            onChange={(value) => {
              setName(value);
              setErrors((current) => ({ ...current, name: undefined }));
            }}
            placeholder="e.g. Registration papers 2026"
            invalid={!!errors.name}
          />
        </Field>
        <FilePicker
          file={file}
          onChange={(next) => {
            setFile(next);
            setErrors((current) => ({ ...current, file: undefined }));
          }}
          error={errors.file}
        />
        <DialogFooter>
          <SafetyButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </SafetyButton>
          <SafetyButton onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save Document"}
          </SafetyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
