import { Button } from "@usi-installer/ui/components/button";
import { cn } from "@usi-installer/ui/lib/utils";
import { FileSpreadsheet } from "lucide-react";
import { useRef, useState } from "react";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

interface ExcelDropzoneProps {
  onFileSelected: (file: File) => void;
  error?: string | null;
  label?: string;
  dropText?: string;
}

/** Drag-and-drop .xlsx picker used by both import screens. */
export function ExcelDropzone({
  onFileSelected,
  error,
  label = "Upload Excel File",
  dropText = "Drag and drop your Excel file here",
}: ExcelDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function accept(file: File | undefined) {
    setLocalError(null);
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setLocalError("Only .xlsx files are accepted.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setLocalError("That file is larger than 10MB.");
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
        <span className="flex size-12 items-center justify-center rounded bg-green-50 text-green-600">
          <FileSpreadsheet className="size-6" />
        </span>
        <p className="mt-4 text-sm font-medium text-gray-700">{dropText}</p>
        <p className="my-2 text-sm text-gray-400">or</p>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(event) => accept(event.target.files?.[0])}
        />
        <Button className="h-[38px] rounded-lg" onClick={() => inputRef.current?.click()}>
          Choose File
        </Button>

        <p className="mt-5 text-xs text-gray-400">
          Accepted format: .xlsx only &nbsp;·&nbsp; Max file size: 10MB
        </p>
      </div>

      {(localError ?? error) && (
        <p className="mt-2 text-sm text-red-600">{localError ?? error}</p>
      )}
    </div>
  );
}
