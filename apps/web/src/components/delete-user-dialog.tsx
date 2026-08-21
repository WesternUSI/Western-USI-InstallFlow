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

interface DeleteUserDialogProps {
  open: boolean;
  name: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}

/** Confirms before an unrecoverable Clerk + Convex account deletion. */
export function DeleteUserDialog({ open, name, onOpenChange, onConfirm }: DeleteUserDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleConfirm() {
    setIsDeleting(true);
    try {
      await onConfirm();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl border-slate-200 bg-white sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-red-50 text-red-600">
            <Trash2 className="size-5" />
          </div>
          <DialogTitle className="text-lg font-bold text-slate-900">Delete {name}?</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-500">
            This is permanent and cannot be undone. This will revoke all access immediately and
            remove the account from Clerk.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="outline"
            className="h-[38px] rounded-lg"
            disabled={isDeleting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="h-[38px] rounded-lg"
            disabled={isDeleting}
            onClick={() => void handleConfirm()}
          >
            {isDeleting ? "Deleting…" : "Delete User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
