import { Button } from "@usi-installer/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@usi-installer/ui/components/dialog";
import { Trash2 } from "lucide-react";
import { useState } from "react";

interface RemoveEmailRecipientDialogProps {
  open: boolean;
  email: string;
  /** Admin addresses come back with a caveat: removal is what makes them stay gone. */
  isAdmin: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}

/** Confirms taking an address off the completion email list for good. */
export function RemoveEmailRecipientDialog({
  open,
  email,
  isAdmin,
  onOpenChange,
  onConfirm,
}: RemoveEmailRecipientDialogProps) {
  const [isRemoving, setIsRemoving] = useState(false);

  async function handleConfirm() {
    setIsRemoving(true);
    try {
      await onConfirm();
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={isRemoving ? () => {} : onOpenChange}>
      <DialogContent className="rounded-xl border-slate-200 bg-white sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-red-50 text-red-600">
            <Trash2 className="size-5" />
          </div>
          <DialogTitle className="text-lg font-bold text-slate-900">Remove {email}?</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-500">
            Completion emails will stop going to this address. Nothing else about the account or the
            work orders changes.
          </DialogDescription>
        </DialogHeader>

        {isAdmin && (
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
            This is an admin's address. Removing it keeps it off the list even though they stay an
            admin — to bring it back you would add it again by hand.
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            className="h-[38px] rounded-lg"
            disabled={isRemoving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="h-[38px] rounded-lg"
            disabled={isRemoving}
            onClick={() => void handleConfirm()}
          >
            {isRemoving ? "Removing…" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
