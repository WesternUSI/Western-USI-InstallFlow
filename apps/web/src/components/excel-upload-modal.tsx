import { Button } from "@usi-installer/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@usi-installer/ui/components/dialog";
import { useState } from "react";
import { toast } from "sonner";

import type { SkippedRow } from "@/lib/excelParsing";

interface ParseResult<TRow> {
  rows: TRow[];
  skipped: SkippedRow[];
}

interface ExcelUploadModalProps<TRow> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  parse: (buffer: ArrayBuffer) => ParseResult<TRow>;
  /** Performs the upload and returns the message to show on success. */
  onConfirm: (rows: TRow[]) => Promise<string>;
}

export function ExcelUploadModal<TRow>({
  open,
  onOpenChange,
  title,
  description,
  parse,
  onConfirm,
}: ExcelUploadModalProps<TRow>) {
  const [result, setResult] = useState<ParseResult<TRow> | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setResult(null);

    try {
      const buffer = await file.arrayBuffer();
      setResult(parse(buffer));
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Failed to parse file");
    }
  }

  async function handleConfirm() {
    if (!result || result.rows.length === 0) return;

    setIsUploading(true);
    try {
      toast.success(await onConfirm(result.rows));
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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
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
