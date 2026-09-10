import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { nextReleaseZoneDate } from "@usi-installer/backend/convex/releaseTime";
import { Button } from "@usi-installer/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@usi-installer/ui/components/dialog";
import { Input } from "@usi-installer/ui/components/input";
import { cn } from "@usi-installer/ui/lib/utils";
import { useMutation } from "convex/react";
import { CalendarClock, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { formatReleaseDate } from "@/components/import-schedule-card";

export interface ScheduledImport {
  _id: Id<"scheduled_imports">;
  file_name: string;
  release_date: string;
  total_rows: number;
  status: "pending" | "releasing" | "released";
}

type OpenDialog = "reschedule" | "release" | "cancel" | null;

const ACTION_TONES = {
  blue: "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300 hover:bg-blue-100",
  green: "border-green-200 bg-green-50 text-green-700 hover:border-green-300 hover:bg-green-100",
  red: "border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100",
} as const;

/**
 * A row action button, tinted by what it does — move it, put it live, throw it
 * away — so the three read apart at a glance instead of as one grey block.
 */
function ActionButton({
  children,
  tone,
  disabled,
  onClick,
}: {
  children: string;
  tone: keyof typeof ACTION_TONES;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-8 rounded-lg border px-3 text-xs font-semibold whitespace-nowrap transition-colors",
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300"
          : ACTION_TONES[tone],
      )}
    >
      {children}
    </button>
  );
}

/**
 * The three things that can be done to a batch that hasn't gone live yet.
 *
 * All of them are off once a batch reaches "releasing": the rows are already
 * moving into `workorders` at that point, and the backend refuses them too.
 */
export function ScheduledImportActions({ batch }: { batch: ScheduledImport }) {
  const rescheduleImport = useMutation(api.scheduledImports.rescheduleImport);
  const releaseNow = useMutation(api.scheduledImports.releaseNow);
  const cancelScheduledImport = useMutation(api.scheduledImports.cancelScheduledImport);

  const [open, setOpen] = useState<OpenDialog>(null);
  const [newDate, setNewDate] = useState(batch.release_date);
  const [isBusy, setIsBusy] = useState(false);

  const locked = batch.status !== "pending";
  const minDate = nextReleaseZoneDate();

  async function run(action: () => Promise<void>, failure: string) {
    setIsBusy(true);
    try {
      await action();
      setOpen(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : failure);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <ActionButton
          tone="blue"
          disabled={locked}
          onClick={() => {
            setNewDate(batch.release_date < minDate ? minDate : batch.release_date);
            setOpen("reschedule");
          }}
        >
          Reschedule
        </ActionButton>
        <ActionButton tone="green" disabled={locked} onClick={() => setOpen("release")}>
          Release now
        </ActionButton>
        <ActionButton tone="red" disabled={locked} onClick={() => setOpen("cancel")}>
          Cancel
        </ActionButton>
      </div>

      <Dialog
        open={open === "reschedule"}
        onOpenChange={isBusy ? () => {} : (next) => setOpen(next ? "reschedule" : null)}
      >
        <DialogContent className="rounded-xl border-slate-200 bg-white sm:max-w-md">
          <DialogHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <CalendarClock className="size-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Move this batch to a different date
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-slate-500">
              {batch.total_rows.toLocaleString()} work orders from {batch.file_name}. They stay
              hidden either way — only the day they appear changes.
            </DialogDescription>
          </DialogHeader>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Release date</span>
            <Input
              type="date"
              value={newDate}
              min={minDate}
              disabled={isBusy}
              onChange={(event) => setNewDate(event.target.value || minDate)}
              className="h-[38px] rounded-lg text-sm"
            />
          </label>

          <DialogFooter>
            <Button
              variant="outline"
              className="h-[38px] rounded-lg"
              disabled={isBusy}
              onClick={() => setOpen(null)}
            >
              Cancel
            </Button>
            <Button
              className="h-[38px] rounded-lg"
              disabled={isBusy || newDate === ""}
              onClick={() =>
                void run(async () => {
                  await rescheduleImport({
                    scheduled_import_id: batch._id,
                    release_date: newDate,
                  });
                  toast.success(`Batch moved to ${formatReleaseDate(newDate)}`);
                }, "Could not move that batch")
              }
            >
              {isBusy ? "Moving…" : "Move batch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={open === "release"}
        onOpenChange={isBusy ? () => {} : (next) => setOpen(next ? "release" : null)}
      >
        <DialogContent className="rounded-xl border-slate-200 bg-white sm:max-w-md">
          <DialogHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <Zap className="size-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Release {batch.total_rows.toLocaleString()} work orders now?
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-slate-500">
              They go live immediately instead of on {formatReleaseDate(batch.release_date)}, and
              are visible to installers straight away. This cannot be undone from here.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
            Releasing also archives completed installs from the previous import, the same as any
            other import does.
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="h-[38px] rounded-lg"
              disabled={isBusy}
              onClick={() => setOpen(null)}
            >
              Cancel
            </Button>
            <Button
              className="h-[38px] rounded-lg"
              disabled={isBusy}
              onClick={() =>
                void run(async () => {
                  await releaseNow({ scheduled_import_id: batch._id });
                  toast.success("Batch released");
                }, "Could not release that batch")
              }
            >
              {isBusy ? "Releasing…" : "Release now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={open === "cancel"}
        onOpenChange={isBusy ? () => {} : (next) => setOpen(next ? "cancel" : null)}
      >
        <DialogContent className="rounded-xl border-slate-200 bg-white sm:max-w-md">
          <DialogHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-red-50 text-red-600">
              <Trash2 className="size-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Cancel this scheduled batch?
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-slate-500">
              {batch.total_rows.toLocaleString()} staged work orders from {batch.file_name} are
              deleted and the batch never releases. Nothing that is already live is affected —
              re-import the file to schedule it again.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              className="h-[38px] rounded-lg"
              disabled={isBusy}
              onClick={() => setOpen(null)}
            >
              Keep it
            </Button>
            <Button
              variant="destructive"
              className="h-[38px] rounded-lg"
              disabled={isBusy}
              onClick={() =>
                void run(async () => {
                  // Staged rows are deleted a batch per call, so this is
                  // driven until the backend reports nothing left.
                  let remaining = 1;
                  while (remaining > 0) {
                    remaining = (await cancelScheduledImport({ scheduled_import_id: batch._id }))
                      .remaining;
                  }
                  toast.success("Scheduled batch cancelled");
                }, "Could not cancel that batch")
              }
            >
              {isBusy ? "Cancelling…" : "Cancel batch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
