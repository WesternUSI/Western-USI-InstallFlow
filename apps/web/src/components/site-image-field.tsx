import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { cn } from "@usi-installer/ui/lib/utils";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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

/**
 * Site photos: a dropzone until the first one is added, then a large preview
 * with a thumbnail strip. The pencil replaces the picture on show; the tile at
 * the end of the strip adds more.
 */
export function SiteImageField({
  images,
  isUploading,
  onFilesSelected,
  onRemove,
}: SiteImageFieldProps) {
  const addRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);

  // Keep the shown picture in range as images are added and removed.
  useEffect(() => {
    setIndex((current) => Math.min(current, Math.max(0, images.length - 1)));
  }, [images.length]);

  function accept(files: FileList | null, replacing = false) {
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
    if (allowed.length === 0) return;

    // Replacing drops the picture on show once the new one has been added.
    const replaced = replacing ? images[index] : undefined;
    onFilesSelected(allowed);
    if (replaced) onRemove(replaced.storage_id);
  }

  const current = images[index];

  return (
    <div>
      <p className="text-base font-bold text-slate-900">Site Image</p>
      <p className="mt-0.5 text-sm text-slate-500">Upload or update the image of the site / panel</p>

      <input
        ref={addRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          accept(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={replaceRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          accept(event.target.files, true);
          event.target.value = "";
        }}
      />

      {current === undefined ? (
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
            accept(event.dataTransfer.files);
          }}
          className={cn(
            "mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 transition-colors",
            isDragging ? "border-blue-400 bg-blue-50/60" : "border-slate-200 bg-white",
          )}
        >
          <UploadCloud className="size-8 text-blue-500" />
          <button
            type="button"
            disabled={isUploading}
            onClick={() => addRef.current?.click()}
            className="mt-4 text-sm text-slate-600 hover:text-slate-900"
          >
            {isUploading ? "Uploading…" : "Drag and drop images here, or click to browse"}
          </button>
          <p className="mt-1.5 text-xs text-slate-400">JPG, PNG up to 10MB</p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative aspect-square max-h-72 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 sm:w-1/2">
            <img src={current.url} alt="Site" className="size-full object-contain" />

            <button
              type="button"
              aria-label="Replace this image"
              disabled={isUploading}
              onClick={() => replaceRef.current?.click()}
              className="absolute top-3 right-3 rounded-md bg-white/90 p-2 text-slate-600 shadow-sm transition-colors hover:bg-white hover:text-slate-900"
            >
              <Pencil className="size-4" />
            </button>

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous image"
                  onClick={() => setIndex((current) => (current - 1 + images.length) % images.length)}
                  className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full bg-white/90 p-2 text-slate-700 shadow-sm transition-colors hover:bg-white"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next image"
                  onClick={() => setIndex((current) => (current + 1) % images.length)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-white/90 p-2 text-slate-700 shadow-sm transition-colors hover:bg-white"
                >
                  <ChevronRight className="size-4" />
                </button>
              </>
            )}
          </div>

          <div className="grid max-h-72 w-fit auto-rows-min grid-cols-2 content-start gap-3 overflow-y-auto p-0.5">
            {images.map((image, thumbIndex) => (
              <div key={image.storage_id} className="group relative">
                <button
                  type="button"
                  aria-label={`Show image ${thumbIndex + 1}`}
                  onClick={() => setIndex(thumbIndex)}
                  className={cn(
                    "size-20 overflow-hidden rounded-lg border bg-slate-50 transition-colors",
                    thumbIndex === index
                      ? "border-blue-500 ring-2 ring-blue-200"
                      : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  <img src={image.url} alt="" className="size-full object-contain" />
                </button>
                <button
                  type="button"
                  aria-label="Remove image"
                  disabled={isUploading}
                  onClick={() => onRemove(image.storage_id)}
                  className="absolute -top-1.5 -right-1.5 hidden rounded-full bg-white p-1 text-slate-500 shadow-sm hover:text-red-600 group-hover:block"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}

            <button
              type="button"
              aria-label="Add more images"
              disabled={isUploading}
              onClick={() => addRef.current?.click()}
              className="flex size-20 items-center justify-center rounded-lg border border-dashed border-slate-300 text-blue-500 transition-colors hover:border-blue-400 hover:bg-blue-50/60"
            >
              <Plus className="size-5" />
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
