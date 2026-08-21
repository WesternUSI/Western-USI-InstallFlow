import { Button } from "@usi-installer/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@usi-installer/ui/components/dialog";
import { Check, Copy, MailCheck } from "lucide-react";
import { useState } from "react";

export interface Credentials {
  email: string;
  password: string;
}

interface CredentialsDialogProps {
  open: boolean;
  title: string;
  description: string;
  credentials: Credentials | null;
  onOpenChange: (open: boolean) => void;
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be refused; nothing useful to show here.
    }
  }

  return (
    <div>
      <p className="text-[11px] font-bold tracking-[0.55px] text-slate-500 uppercase">{label}</p>
      <div className="mt-1.5 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
        <span className="truncate font-mono text-sm text-slate-800">{value}</span>
        <button
          type="button"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={() => void copy()}
          className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
        >
          {copied ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}

/**
 * Shows a freshly issued (or re-shown) email/password pair for the admin to
 * hand over directly — there is no email provider wired up yet, so this
 * dialog is the actual delivery mechanism, not a preview of one.
 */
export function CredentialsDialog({
  open,
  title,
  description,
  credentials,
  onOpenChange,
}: CredentialsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-xl border-slate-200 bg-white">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <MailCheck className="size-5" />
          </div>
          <DialogTitle className="mt-2 text-lg font-bold text-slate-900">{title}</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">{description}</DialogDescription>
        </DialogHeader>

        {credentials && (
          <div className="flex flex-col gap-3">
            <CopyRow label="Email" value={credentials.email} />
            <CopyRow label="Password" value={credentials.password} />
          </div>
        )}

        <Button className="h-[38px] w-full rounded-lg" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      </DialogContent>
    </Dialog>
  );
}
