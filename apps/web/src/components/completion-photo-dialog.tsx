import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@usi-installer/ui/components/dialog";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

interface CompletionPhotoDialogProps {
  open: boolean;
  urls: string[];
  /** Panel the photos belong to, so a full-screen image still has a label. */
  panelSplit: string;
  site: string;
  onOpenChange: (open: boolean) => void;
}

/**
 * Shows the completion photos at a size worth looking at.
 *
 * The table can only afford a small thumbnail, which is not enough to check an
 * install by — and the alternative, opening the raw file in a new tab, loses
 * the panel it belongs to and drops the operator out of the table entirely.
 *
 * One photo at a time rather than a stack: an installer can submit several
 * shots of the same panel, and stacking them makes the dialog a long scroll in
 * which nothing is ever shown at full height. This mirrors the carousel the
 * mobile app uses for site images, so the two read the same way.
 */
export function CompletionPhotoDialog({
  open,
  urls,
  panelSplit,
  site,
  onOpenChange,
}: CompletionPhotoDialogProps) {
  const [index, setIndex] = useState(0);

  // Always open on the first photo, however the last visit was left.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  // Clamped rather than stored safe: `urls` can shrink under a live query while
  // the dialog is open.
  const count = urls.length;
  const safeIndex = Math.min(index, Math.max(count - 1, 0));
  const current = urls[safeIndex];

  const step = (by: number) => setIndex((i) => (i + by + count) % count);

  // Arrow keys are what anyone reaches for in a photo viewer.
  useEffect(() => {
    if (!open || count < 2) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, count]);

  if (current === undefined) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border-slate-200 bg-white sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900">{panelSplit}</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">{site}</DialogDescription>
        </DialogHeader>

        <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
          {/* `object-contain` and a viewport-relative cap: installers shoot in
              both orientations, and neither should be cropped or overflow. */}
          <img
            src={current}
            alt={
              count > 1
                ? `Completed installation at ${site} (${safeIndex + 1} of ${count})`
                : `Completed installation at ${site}`
            }
            className="max-h-[60vh] w-full object-contain"
          />

          {count > 1 && (
            <>
              <span className="absolute top-3 right-3 rounded-md bg-black/55 px-2 py-1 text-xs font-semibold text-white">
                {safeIndex + 1} / {count}
              </span>

              <button
                type="button"
                aria-label="Previous photo"
                onClick={() => step(-1)}
                className="absolute top-1/2 left-3 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white transition-colors hover:bg-black/65"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={() => step(1)}
                className="absolute top-1/2 right-3 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white transition-colors hover:bg-black/65"
              >
                <ChevronRight className="size-5" />
              </button>
            </>
          )}
        </div>

        {count > 1 && (
          <div className="flex flex-wrap gap-2">
            {urls.map((url, i) => (
              <button
                key={url}
                type="button"
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === safeIndex}
                onClick={() => setIndex(i)}
                className={`size-14 overflow-hidden rounded-md border-2 transition-colors ${
                  i === safeIndex
                    ? "border-blue-500"
                    : "border-slate-200 opacity-70 hover:opacity-100"
                }`}
              >
                <img src={url} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <a
          href={current}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          Open full size{count > 1 ? ` (${safeIndex + 1} of ${count})` : ""}
          <ExternalLink className="size-4" />
        </a>
      </DialogContent>
    </Dialog>
  );
}
