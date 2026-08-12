import { Button } from "@usi-installer/ui/components/button";
import { cn } from "@usi-installer/ui/lib/utils";
import { Pencil, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

interface SiteImageFieldProps {
  imageUrl: string | undefined;
  isUploading: boolean;
  onFileSelected: (file: File) => void;
  onRemove: () => void;
}

/**
 * Site photo: a dashed dropzone when empty, the photo with an edit button once
 * one is set.
 */
export function SiteImageField({
  imageUrl,
  isUploading,
  onFileSelected,
  onRemove,
}: SiteImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function accept(file: File | undefined) {
    setError(null);
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Only image files are accepted.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("That image is larger than 10MB.");
      return;
    }

    onFileSelected(file);
  }

  return (
    <div>
      <p className="text-sm font-semibold text-gray-900">Site Image</p>
      <p className="mt-0.5 text-xs text-gray-500">Upload or update the image of the site / panel</p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => accept(event.target.files?.[0])}
      />

      {imageUrl ? (
        <div className="relative mt-3 overflow-hidden rounded-lg border border-slate-200">
          <img src={imageUrl} alt="Site" className="h-64 w-full object-cover" />
          <div className="absolute top-3 right-3 flex gap-2">
            <Button
              size="icon-sm"
              variant="outline"
              aria-label="Replace image"
              disabled={isUploading}
              onClick={() => inputRef.current?.click()}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isUploading}
              onClick={onRemove}
              className="text-sm"
            >
              Remove
            </Button>
          </div>
        </div>
      ) : (
        // biome-ignore lint/a11y/noStaticElementInteractions: drag target; the button inside is the accessible control
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
            "mt-3 flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 transition-colors",
            isDragging ? "border-blue-400 bg-blue-50/60" : "border-slate-300 bg-white",
          )}
        >
          <UploadCloud className="size-7 text-blue-500" />
          <button
            type="button"
            disabled={isUploading}
            onClick={() => inputRef.current?.click()}
            className="mt-3 text-sm text-gray-600 hover:text-gray-900"
          >
            {isUploading ? "Uploading…" : "Drag and drop image here, or click to browse"}
          </button>
          <p className="mt-1.5 text-xs text-gray-400">JPG, PNG up to 10MB</p>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
