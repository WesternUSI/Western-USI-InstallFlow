import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { cn } from "@usi-installer/ui/lib/utils";
import { Trash2, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface SiteImage {
  storage_id: Id<"_storage">;
  url: string;
}

interface SiteImageFieldProps {
  images: SiteImage[];
  isUploading: boolean;
  onFilesSelected: (files: File[]) => void;
  onRemove: (storageId: Id<"_storage">) => void;
}

/** Site photos: a gallery of everything uploaded plus a dropzone to add more. */
export function SiteImageField({
  images,
  isUploading,
  onFilesSelected,
  onRemove,
}: SiteImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function accept(files: FileList | null) {
    setError(null);
    if (!files || files.length === 0) return;

    const picked = [...files];
    const rejected = picked.filter(
      (file) => !file.type.startsWith("image/") || file.size > MAX_IMAGE_BYTES,
    );
    const allowed = picked.filter((file) => !rejected.includes(file));

    if (rejected.length > 0) {
      setError(
        rejected.length === picked.length
          ? "Only images up to 10MB can be added."
          : `${rejected.length} file${rejected.length === 1 ? "" : "s"} skipped — images up to 10MB only.`,
      );
    }
    if (allowed.length > 0) onFilesSelected(allowed);
  }

  return (
    <div>
      <p className="text-sm font-semibold text-gray-900">Site Image</p>
      <p className="mt-0.5 text-xs text-gray-500">
        Upload or update the images of the site / panel. You can add more than one.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          accept(event.target.files);
          event.target.value = "";
        }}
      />

      {images.length > 0 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {images.map((image) => (
            <div
              key={image.storage_id}
              className="group relative overflow-hidden rounded-lg border border-slate-200"
            >
              <img src={image.url} alt="Site" className="h-40 w-full object-cover" />
              <button
                type="button"
                aria-label="Remove image"
                disabled={isUploading}
                onClick={() => onRemove(image.storage_id)}
                className="absolute top-2 right-2 rounded-md bg-white/90 p-1.5 text-slate-600 shadow-sm transition-colors hover:bg-white hover:text-red-600"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

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
          accept(event.dataTransfer.files);
        }}
        className={cn(
          "mt-3 flex flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors",
          images.length > 0 ? "px-6 py-6" : "px-6 py-10",
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
          {isUploading
            ? "Uploading…"
            : images.length > 0
              ? "Add more images"
              : "Drag and drop images here, or click to browse"}
        </button>
        <p className="mt-1.5 text-xs text-gray-400">JPG, PNG up to 10MB each</p>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
