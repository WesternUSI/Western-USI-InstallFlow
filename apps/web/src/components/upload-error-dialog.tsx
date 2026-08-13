import { Link } from "@tanstack/react-router";
import { Button } from "@usi-installer/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@usi-installer/ui/components/dialog";
import { FileWarning } from "lucide-react";

export interface UploadError {
  title: string;
  description: string;
  /** Offered when the file belongs on the other import screen. */
  action?: { to: "/import-site-data" | "/import-work-orders"; label: string };
}

interface UploadErrorDialogProps {
  error: UploadError | null;
  onClose: () => void;
}

/** Explains why an uploaded file could not be used, in the same shell as the other dialogs. */
export function UploadErrorDialog({ error, onClose }: UploadErrorDialogProps) {
  return (
    <Dialog open={error !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-xl border-slate-200 bg-white sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded bg-red-50 text-red-600">
            <FileWarning className="size-5" />
          </div>
          <DialogTitle className="text-lg font-bold text-slate-900">{error?.title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-500">
            {error?.description}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" className="h-[38px] rounded-lg" onClick={onClose}>
            {error?.action ? "Cancel" : "Close"}
          </Button>
          {error?.action && (
            <Button className="h-[38px] rounded-lg" render={<Link to={error.action.to} />}>
              {error.action.label}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
