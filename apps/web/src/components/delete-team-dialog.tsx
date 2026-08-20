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

interface DeleteTeamDialogProps {
  open: boolean;
  name: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}

/**
 * Confirms taking a team off the Teams list.
 *
 * The row itself is kept rather than deleted: work orders reference a team by
 * name, so completed installs have to keep reading correctly long after the
 * crew stops being used.
 */
export function DeleteTeamDialog({ open, name, onOpenChange, onConfirm }: DeleteTeamDialogProps) {
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
            {name} will be removed from the Teams list and from every team picker. Work orders it
            already completed keep their record, so past installs still read correctly. A team
            that still has members can't be deleted — move them first.
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
            {isDeleting ? "Deleting…" : "Delete Team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
