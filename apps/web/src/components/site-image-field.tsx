import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { cn } from "@usi-installer/ui/lib/utils";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Thumbnail cells beside the cover, before the rest collapse into "+N More". */
const MAX_THUMBS = 3;

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
 * Site photos: a dropzone until the first one is added, then a four-tile
 * gallery — a tall cover on the left that steps through every photo, three
 * thumbnails beside it, and a dashed tile to add more. Clicking a thumbnail
 * promotes it to the cover.
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

  function accept(files: FileList | null, replacing?: SiteImage) {
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

    onFilesSelected(allowed);
    if (replacing) onRemove(replacing.storage_id);
  }

  const cover = images[index];
  // Everything that isn't currently on the cover, so the strip never repeats
  // the large picture back at you.
  const others = images.filter((_, position) => position !== index);
  const overflow = Math.max(0, others.length - MAX_THUMBS);
  const thumbs = others.slice(0, MAX_THUMBS);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[18px] leading-7 font-medium text-[#111827]">Site Image</p>
        <p className="text-sm leading-5 text-[#6B7280]">
          Upload or update the image of the site / panel.
        </p>
      </div>

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
          accept(event.target.files, cover);
          event.target.value = "";
        }}
      />

      {cover === undefined ? (
        // The whole dashed area is the control, so a click anywhere inside it
        // opens the picker rather than only the line of text.
        <button
          type="button"
          disabled={isUploading}
          onClick={() => addRef.current?.click()}
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
            "flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 transition-colors",
            isDragging
              ? "border-blue-400 bg-blue-50/60"
              : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40",
          )}
        >
          <UploadCloud className="size-8 text-blue-500" />
          <span className="mt-4 text-sm text-slate-600">
            {isUploading ? "Uploading…" : "Drag and drop images here, or click to browse"}
          </span>
          <span className="mt-1.5 text-xs text-slate-400">JPG, PNG up to 10MB</span>
        </button>
      ) : (
        <div
          className={cn(
            "grid w-full gap-[15px]",
            // Phones get a full-width cover over a two-up strip; the design's
            // three-column proportions only work once there is room for them.
            "grid-cols-2",
            "sm:aspect-[926/518] sm:max-h-[518px] sm:grid-cols-[2fr_1fr_1fr] sm:grid-rows-[1.2fr_1fr]",
          )}
        >
          {/* Cover — the photo currently being stepped through. */}
          <div className="group relative col-span-2 aspect-[4/3] overflow-hidden rounded-[10px] bg-slate-100 sm:col-span-1 sm:row-span-2 sm:aspect-auto">
            <img src={cover.url} alt="Site" className="size-full object-cover" />

            <button
              type="button"
              aria-label="Replace this image"
              disabled={isUploading}
              onClick={() => replaceRef.current?.click()}
              className="absolute top-2 right-2 rounded-md bg-white p-1.5 text-slate-600 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-colors hover:text-slate-900"
            >
              <Pencil className="size-[19px]" />
            </button>
            <button
              type="button"
              aria-label="Remove this image"
              disabled={isUploading}
              onClick={() => onRemove(cover.storage_id)}
              className="absolute top-2 left-2 hidden rounded-md bg-white p-1.5 text-slate-500 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-colors hover:text-red-600 group-hover:block"
            >
              <Trash2 className="size-[19px]" />
            </button>

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={() => setIndex((current) => (current - 1 + images.length) % images.length)}
                  className="absolute top-1/2 left-0 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-[2px] transition-colors hover:bg-black/60"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={() => setIndex((current) => (current + 1) % images.length)}
                  className="absolute top-1/2 right-0 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-[2px] transition-colors hover:bg-black/60"
                >
                  <ChevronRight className="size-5" />
                </button>
              </>
            )}
          </div>

          {thumbs.map((image, thumbIndex) => {
            const isLastThumb = thumbIndex === thumbs.length - 1;

            return (
              <div
                key={image.storage_id}
                className="group relative aspect-square overflow-hidden rounded-[5px] border border-[#E9E9E9] bg-slate-100 sm:aspect-auto"
              >
                <button
                  type="button"
                  aria-label="Show this photo"
                  onClick={() => setIndex(images.indexOf(image))}
                  className="size-full"
                >
                  <img src={image.url} alt="" className="size-full object-cover" />
                </button>

                <button
                  type="button"
                  aria-label="Remove image"
                  disabled={isUploading}
                  onClick={() => onRemove(image.storage_id)}
                  className="absolute top-1.5 right-1.5 hidden rounded-md bg-white/90 p-1.5 text-slate-500 shadow-sm transition-colors hover:bg-white hover:text-red-600 group-hover:block"
                >
                  <Trash2 className="size-3.5" />
                </button>

                {overflow > 0 && isLastThumb && (
                  <button
                    type="button"
                    aria-label={`Show ${overflow} more photo${overflow === 1 ? "" : "s"}`}
                    onClick={() => setIndex(images.indexOf(image))}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-semibold text-white transition-colors hover:bg-black/60"
                  >
                    +{overflow} More
                  </button>
                )}
              </div>
            );
          })}

          <button
            type="button"
            aria-label="Add more images"
            disabled={isUploading}
            onClick={() => addRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-[5px] rounded-lg border border-dashed border-[#2563EB]/30 bg-[#F5FAFF] transition-colors hover:border-[#2563EB]/60 hover:bg-[#EFF6FF] sm:aspect-auto"
          >
            <span className="flex size-[53px] items-center justify-center rounded-full bg-[#2563EB] text-white">
              <Plus className="size-7" />
            </span>
            <span className="text-base tracking-[0.3px] text-[#9CA3AF]">Add more images</span>
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
