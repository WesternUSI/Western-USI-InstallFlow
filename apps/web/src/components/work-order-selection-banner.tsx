import { Button } from "@usi-installer/ui/components/button";
import { Trash2 } from "lucide-react";

interface WorkOrderSelectionBannerProps {
  /** Rows the delete would cover — the ticked ones, or the whole filter. */
  selectedCount: number;
  onClear: () => void;
  onDelete: () => void;
}

/**
 * Sits between the status tabs and the rows while anything is ticked.
 *
 * Deliberately just a count and two buttons: selecting everything the filter
 * matches is the header checkbox's job, so there is no "select all" link here
 * offering a second route to the same thing.
 */
export function WorkOrderSelectionBanner({
  selectedCount,
  onClear,
  onDelete,
}: WorkOrderSelectionBannerProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-blue-50/70 px-6 py-3">
      <span className="text-sm font-semibold text-slate-800">
        {selectedCount.toLocaleString()} selected
      </span>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          className="h-[34px] rounded-lg border-slate-200 bg-white text-sm"
          onClick={onClear}
        >
          Clear
        </Button>
        <Button variant="destructive" className="h-[34px] rounded-lg text-sm" onClick={onDelete}>
          <Trash2 className="size-4" />
          Delete
        </Button>
      </div>
    </div>
  );
}
