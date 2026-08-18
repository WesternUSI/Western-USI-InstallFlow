import { Button } from "@usi-installer/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@usi-installer/ui/components/dialog";

/** Same shape as lucide's BadgeCheck, filled solid blue with a white check
 * instead of the default two-tone outline. */
function CheckBadge({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
        fill="currentColor"
      />
      <path d="m9 12 2 2 4-4" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface InviteSentDialogProps {
  open: boolean;
  name: string;
  workEmail: string;
  team: string;
  onOpenChange: (open: boolean) => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-3 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-800">{value}</span>
    </div>
  );
}

/** Shown after an installer invite is created, confirming what was sent. */
export function InviteSentDialog({ open, name, workEmail, team, onOpenChange }: InviteSentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-xl border-slate-200 bg-white">
        <DialogHeader className="items-center text-center">
          <CheckBadge className="size-16 text-blue-600" />
          <DialogTitle className="mt-2 text-lg font-bold text-slate-900">Invite Sent</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            The installer invitation has been sent successfully.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col">
          <Row label="User Name" value={name} />
          <Row label="Work Email" value={workEmail} />
          <Row label="Primary Team" value={team} />
        </div>

        <Button className="h-[38px] w-full rounded-lg" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      </DialogContent>
    </Dialog>
  );
}
