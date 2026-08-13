import { Button } from "@usi-installer/ui/components/button";
import { cn } from "@usi-installer/ui/lib/utils";
import { useRef, useState } from "react";

import { ExcelIcon } from "@/components/excel-icon";
import type { UploadError } from "@/components/upload-error-dialog";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

interface ExcelDropzoneProps {
  onFileSelected: (file: File) => void;
  /** Reported for files rejected before parsing, so the screen can show its dialog. */
  onReject: (error: UploadError) => void;
  label?: string;
  dropText?: string;
}

/** Drag-and-drop .xlsx picker used by both import screens. */
export function ExcelDropzone({
  onFileSelected,
  onReject,
  label = "Upload Excel File",
  dropText = "Drag and drop your Excel file here",
}: ExcelDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function accept(file: File | undefined) {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      onReject({
        title: "That's not an Excel file",
        description: `Only .xlsx files can be imported, and "${file.name}" isn't one. If it's an older .xls or a .csv, open it in Excel and save it as .xlsx first.`,
      });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      onReject({
        title: "That file is too large",
        description: `The limit is 10MB and "${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)}MB.`,
      });
      return;
    }

    onFileSelected(file);
  }

  return (
    <div>
      <p className="mb-3 text-base font-bold text-gray-900">{label}</p>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drag target; the button inside is the accessible control */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          accept(event.dataTransfer.files[0]);
        }}
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-14 transition-colors",
          isDragging ? "border-blue-400 bg-blue-50/60" : "border-slate-300 bg-white",
        )}
      >
        <ExcelIcon className="size-12" />
        <p className="mt-4 text-sm font-medium text-gray-700">{dropText}</p>
        <p className="my-2 text-sm text-gray-400">or</p>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(event) => {
            accept(event.target.files?.[0]);
            // Clearing the value lets the same file be picked again after a
            // Cancel — otherwise the browser sees no change and never fires.
            event.target.value = "";
          }}
        />
        <Button className="h-[38px] rounded-lg" onClick={() => inputRef.current?.click()}>
          Choose File
        </Button>

        <p className="mt-5 text-xs text-gray-400">
          Accepted format: .xlsx only &nbsp;·&nbsp; Max file size: 10MB
        </p>
      </div>
    </div>
  );
}
