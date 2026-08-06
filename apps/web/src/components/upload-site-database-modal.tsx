import { api } from "@usi-installer/backend/convex/_generated/api";
import { Button } from "@usi-installer/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@usi-installer/ui/components/dialog";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { parseSiteDatabase, type ParseSiteDatabaseResult } from "@/lib/parseSiteDatabase";

interface UploadSiteDatabaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UploadSiteDatabaseModal({ open, onOpenChange }: UploadSiteDatabaseModalProps) {
  const [result, setResult] = useState<ParseSiteDatabaseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const upsertSites = useMutation(api.sites.upsertSites);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setResult(null);

    try {
      const buffer = await file.arrayBuffer();
      setResult(parseSiteDatabase(buffer));
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Failed to parse file");
    }
  }

  async function handleConfirm() {
    if (!result || result.rows.length === 0) return;

    setIsUploading(true);
    try {
      const { inserted, updated } = await upsertSites({ rows: result.rows });
      toast.success(`Upload complete: ${inserted} inserted, ${updated} updated`);
      setResult(null);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Site Database</DialogTitle>
          <DialogDescription>
            Select the Go Site Database Excel file. Existing sites are matched and updated by
            Panel ID; new Panel IDs are added.
          </DialogDescription>
        </DialogHeader>

        <input type="file" accept=".xlsx" onChange={handleFileChange} className="text-xs" />

        {parseError && <p className="text-xs text-destructive">{parseError}</p>}

        {result && (
          <div className="flex flex-col gap-2 text-xs">
            <p>{result.rows.length} rows ready to upload.</p>
            {result.skipped.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-none border border-border p-2">
                <p className="mb-1 font-medium">{result.skipped.length} rows skipped:</p>
                <ul className="flex flex-col gap-0.5 text-muted-foreground">
                  {result.skipped.map((s) => (
                    <li key={s.row}>
                      Row {s.row}: {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={isUploading} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!result || result.rows.length === 0 || isUploading}
            onClick={handleConfirm}
          >
            {isUploading ? "Uploading..." : "Confirm Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
