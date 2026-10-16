import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@usi-installer/ui/components/dialog";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Field, TextArea } from "@/components/whs/safety-form";
import { SafetyButton } from "@/components/whs/safety-ui";

/**
 * Asks for a reason before sending something back (new evidence, a
 * replacement certificate, an on-site change). The reason is required: the
 * person on the other end needs to know what to fix.
 */
export function ReasonDialog({
  open,
  title,
  description,
  placeholder,
  confirmLabel,
  missingMessage,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  placeholder?: string;
  confirmLabel: string;
  /** Shown when the reason is left empty. */
  missingMessage: string;
  onClose: () => void;
  /** Resolves when sent; the dialog closes. Throw to keep it open. */
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
      setError(undefined);
    }
  }, [open]);

  const confirm = async () => {
    if (reason.trim() === "") {
      setError(missingMessage);
      toast.error(missingMessage);
      return;
    }
    setSending(true);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch {
      // The caller has already shown the error; keep the dialog open to retry.
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !sending && onClose()}>
      <DialogContent className="rounded-xl border-slate-200 bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900">{title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-500">{description}</DialogDescription>
        </DialogHeader>
        <Field label="Reason" required error={error}>
          <TextArea
            value={reason}
            onChange={(value) => {
              setReason(value);
              setError(undefined);
            }}
            placeholder={placeholder}
            rows={4}
            invalid={!!error}
          />
        </Field>
        <DialogFooter>
          <SafetyButton variant="secondary" onClick={onClose} disabled={sending}>
            Cancel
          </SafetyButton>
          <SafetyButton onClick={() => void confirm()} disabled={sending}>
            {sending ? "Sending…" : confirmLabel}
          </SafetyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
