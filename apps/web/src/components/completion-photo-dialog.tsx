import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@usi-installer/ui/components/dialog";
import { ExternalLink } from "lucide-react";

interface CompletionPhotoDialogProps {
  open: boolean;
  url: string;
  /** Panel the photo belongs to, so a full-screen image still has a label. */
  panelSplit: string;
  site: string;
  onOpenChange: (open: boolean) => void;
}

/**
 * Shows a completion photo at a size worth looking at.
 *
 * The table can only afford a 40px thumbnail, which is not enough to check an
 * install by — and the alternative, opening the raw file in a new tab, loses
 * the panel it belongs to and drops the operator out of the table entirely.
 */
export function CompletionPhotoDialog({
  open,
  url,
  panelSplit,
  site,
  onOpenChange,
}: CompletionPhotoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl border-slate-200 bg-white sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900">{panelSplit}</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">{site}</DialogDescription>
        </DialogHeader>

        {/* `object-contain` and a viewport-relative cap: installers shoot in
            both orientations, and neither should be cropped or overflow. */}
        <img
          src={url}
          alt={`Completed installation at ${site}`}
          className="max-h-[65vh] w-full rounded-lg border border-slate-200 bg-slate-50 object-contain"
        />

        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          Open full size
          <ExternalLink className="size-4" />
        </a>
      </DialogContent>
    </Dialog>
  );
}
