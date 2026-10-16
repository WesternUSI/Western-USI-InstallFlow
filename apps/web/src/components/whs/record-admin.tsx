import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@usi-installer/ui/components/dialog";
import { Archive, Pencil } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";

import { SideButton, SideCard } from "@/components/whs/record-cards";
import { ReasonDialog } from "@/components/whs/reason-dialog";
import { Field, TextArea } from "@/components/whs/safety-form";
import { Notice, SafetyButton } from "@/components/whs/safety-ui";

/**
 * Correcting and archiving a register record (framework 11, decision AD32):
 * every change asks why, and the record's activity keeps what changed, who
 * changed it and when. Archived records stay viewable, read-only.
 */

/**
 * The edit form in a dialog: the page's own fields, then the reason. `onSave`
 * checks the fields, saves, and resolves true to close (false keeps it open;
 * it shows its own errors).
 */
export function EditRecordDialog({
  open,
  title,
  onClose,
  onSave,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onSave: (reason: string) => Promise<boolean>;
  children: ReactNode;
}) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
      setReasonError(undefined);
    }
  }, [open]);

  const save = async () => {
    if (reason.trim() === "") {
      setReasonError("Enter the reason for the change");
      toast.error("Enter the reason for the change");
      return;
    }
    setSaving(true);
    try {
      if (await onSave(reason.trim())) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-xl border-slate-200 bg-white sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900">{title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-500">
            Correct the details, then say why. The old values, who changed them and why are kept in the record's activity.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">{children}</div>
        <Field label="Reason for the change" required error={reasonError}>
          <TextArea
            value={reason}
            onChange={(value) => {
              setReason(value);
              setReasonError(undefined);
            }}
            placeholder="e.g. Expiry date was typed wrong; the card says 12 March 2028"
            invalid={!!reasonError}
          />
        </Field>
        <DialogFooter>
          <SafetyButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </SafetyButton>
          <SafetyButton onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </SafetyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The side card with "Edit details" and "Archive" for a record the admin manages. */
export function ManageRecordCard({
  noun,
  onEdit,
  onArchive,
}: {
  /** "vehicle", "policy", "kit", "document". */
  noun: string;
  onEdit: () => void;
  /** Absent when this kind of record isn't archived (accreditations). */
  onArchive?: (reason: string) => Promise<void>;
}) {
  const [archiving, setArchiving] = useState(false);
  return (
    <SideCard title="Manage">
      <SideButton onClick={onEdit}>
        <Pencil className="size-3.5" />
        Edit Details
      </SideButton>
      {onArchive ? (
        <>
          <SideButton onClick={() => setArchiving(true)}>
            <Archive className="size-3.5" />
            Archive
          </SideButton>
          <ReasonDialog
            open={archiving}
            title={`Archive this ${noun}?`}
            description={`It stops showing in the register and no reminders go out. It is kept, with its history, never deleted.`}
            placeholder={`e.g. The ${noun} is no longer used`}
            confirmLabel="Archive"
            missingMessage="Enter the reason for archiving it"
            onClose={() => setArchiving(false)}
            onConfirm={onArchive}
          />
        </>
      ) : null}
    </SideCard>
  );
}

export function ArchivedNotice({ noun }: { noun: string }) {
  return <Notice tone="warning">This {noun} is archived. It is kept with its history but no longer used, so it can't be changed.</Notice>;
}
