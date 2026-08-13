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
import { Database } from "lucide-react";

interface SiteDataRequiredDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Shown when someone tries to import work orders before any site exists. Every
 * work order is matched to a site by panel id, so importing first would flag
 * the whole file as missing sites.
 */
export function SiteDataRequiredDialog({ open, onOpenChange }: SiteDataRequiredDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl border-slate-200 bg-white sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded bg-amber-50 text-amber-600">
            <Database className="size-5" />
          </div>
          <DialogTitle className="text-lg font-bold text-slate-900">
            Upload site data first
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-500">
            The Site Database is empty. Work orders are matched to sites by Panel ID, so importing
            now would leave every row without a site. Import the Go Site Database file first, then
            come back.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="outline"
            className="h-[38px] rounded-lg"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button className="h-[38px] rounded-lg" render={<Link to="/import-site-data" />}>
            Import Site Data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
