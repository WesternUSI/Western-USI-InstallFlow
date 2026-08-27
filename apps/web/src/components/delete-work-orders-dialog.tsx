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

interface DeleteWorkOrdersDialogProps {
  open: boolean;
  /** How many work orders the confirmed delete would remove. */
  total: number;
  /** How many of those are completed — drives the warning. */
  completed: number;
  /**
   * Rows deleted so far, or null while nothing is running. Large deletes go in
   * batches, so the button reports progress rather than appearing to hang.
   */
  deletedSoFar: number | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}

/**
 * Confirms deleting work orders — the panel's only irreversible bulk action.
 *
 * The completed count is called out separately because those rows are the ones
 * that cannot be re-imported: a completed order carries the installer's photo,
 * notes and sign-off date, none of which exist in the source spreadsheet.
 */
export function DeleteWorkOrdersDialog({
  open,
  total,
  completed,
  deletedSoFar,
  onOpenChange,
  onConfirm,
}: DeleteWorkOrdersDialogProps) {
  const isDeleting = deletedSoFar !== null;

  return (
    <Dialog open={open} onOpenChange={isDeleting ? () => {} : onOpenChange}>
      <DialogContent className="rounded-xl border-slate-200 bg-white sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-red-50 text-red-600">
            <Trash2 className="size-5" />
          </div>
          <DialogTitle className="text-lg font-bold text-slate-900">
            Delete {total.toLocaleString()} work order{total === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-500">
            This is permanent and cannot be undone. Re-importing the schedule would bring these rows
            back as new, unallocated work orders.
          </DialogDescription>
        </DialogHeader>

        {completed > 0 && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700">
            <span className="font-semibold">
              {completed.toLocaleString()} of these {completed === 1 ? "is" : "are"} completed.
            </span>{" "}
            Their installation photos, notes and completion dates will be deleted too, and cannot be
            recovered from the spreadsheet.
          </div>
        )}

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
            onClick={() => void onConfirm()}
          >
            {isDeleting
              ? `Deleting… ${deletedSoFar.toLocaleString()} / ${total.toLocaleString()}`
              : `Delete ${total.toLocaleString()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
