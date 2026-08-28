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

interface DeleteSitesDialogProps {
  open: boolean;
  /** How many sites the confirmed delete would remove. */
  total: number;
  /**
   * Sites deleted so far, or null while nothing is running. Large deletes go in
   * batches, so the button reports progress rather than appearing to hang.
   */
  deletedSoFar: number | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}

/**
 * Confirms deleting sites.
 *
 * The knock-on effect gets its own paragraph because it is not obvious from
 * the table: sites are what work orders are matched against, so removing one
 * changes rows on a screen the operator is not looking at.
 */
export function DeleteSitesDialog({
  open,
  total,
  deletedSoFar,
  onOpenChange,
  onConfirm,
}: DeleteSitesDialogProps) {
  const isDeleting = deletedSoFar !== null;

  return (
    <Dialog open={open} onOpenChange={isDeleting ? () => {} : onOpenChange}>
      <DialogContent className="rounded-xl border-slate-200 bg-white sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-red-50 text-red-600">
            <Trash2 className="size-5" />
          </div>
          <DialogTitle className="text-lg font-bold text-slate-900">
            Delete {total.toLocaleString()} site{total === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-500">
            This is permanent. Any reference photos on {total === 1 ? "this site" : "these sites"}{" "}
            are deleted with {total === 1 ? "it" : "them"} and cannot be recovered — re-importing
            the Site Database brings back the spreadsheet columns, but not the photos, install notes
            or GPS added here.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
          Work orders matched to {total === 1 ? "this site" : "these sites"} are{" "}
          <span className="font-semibold">not deleted</span>. They move to Missing Sites, and link
          themselves back up if the site is imported or added again.
        </div>

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
