import { Button } from "@usi-installer/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@usi-installer/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@usi-installer/ui/components/dropdown-menu";
import { Input } from "@usi-installer/ui/components/input";
import { CalendarRange, Check, ChevronDown } from "lucide-react";
import { useState } from "react";

/** How the table's `upload_date` window is chosen. */
export type Duration =
  | { kind: "all" }
  | { kind: "days"; days: number }
  | { kind: "custom"; from: string; to: string };

export const ALL_TIME: Duration = { kind: "all" };

const PRESETS = [1, 7, 30, 90];

/** Today as `YYYY-MM-DD` in the viewer's timezone. */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - (days - 1));
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatShort(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/**
 * The inclusive `upload_date` bounds a duration covers.
 *
 * Computed in the browser because `upload_date` is stamped from the uploader's
 * local date, so a server-side "today" could land a day either side of it.
 * A duration of 1 day means today only.
 */
export function durationRange(duration: Duration): { since?: string; until?: string } {
  if (duration.kind === "all") return {};
  if (duration.kind === "days") return { since: daysAgoIso(duration.days) };
  return { since: duration.from, until: duration.to };
}

/**
 * The same window as epoch milliseconds, for tables dated by `_creationTime`
 * rather than an uploaded date string. The end date is pushed to the last
 * millisecond of that day so it stays inclusive.
 */
export function durationRangeMs(duration: Duration): { sinceMs?: number; untilMs?: number } {
  const startOfDay = (iso: string) => {
    const [year, month, day] = iso.split("-").map(Number);
    return new Date(year, month - 1, day).getTime();
  };

  if (duration.kind === "all") return {};
  if (duration.kind === "days") return { sinceMs: startOfDay(daysAgoIso(duration.days)) };
  return {
    sinceMs: startOfDay(duration.from),
    untilMs: startOfDay(duration.to) + 24 * 60 * 60 * 1000 - 1,
  };
}

function durationLabel(duration: Duration): string {
  if (duration.kind === "all") return "Duration";
  if (duration.kind === "days") return duration.days === 1 ? "1 day" : `${duration.days} days`;
  return `${formatShort(duration.from)} – ${formatShort(duration.to)}`;
}

interface DurationSelectProps {
  value: Duration;
  onChange: (duration: Duration) => void;
}

/**
 * Narrows the table to work orders imported in a date window. Sits where the
 * Filters button used to and keeps that button's shape.
 */
export function DurationSelect({ value, onChange }: DurationSelectProps) {
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [from, setFrom] = useState(daysAgoIso(7));
  const [to, setTo] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);

  function openCustom() {
    if (value.kind === "custom") {
      setFrom(value.from);
      setTo(value.to);
    }
    setError(null);
    setIsCustomOpen(true);
  }

  function applyCustom() {
    if (from === "" || to === "") {
      setError("Pick both a start and an end date.");
      return;
    }
    if (from > to) {
      setError("The start date must come before the end date.");
      return;
    }
    onChange({ kind: "custom", from, to });
    setIsCustomOpen(false);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" className="h-[38px] gap-2 rounded-lg">
              <CalendarRange className="size-4" />
              {durationLabel(value)}
              <ChevronDown className="size-4 text-slate-400" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-44 rounded-lg border-slate-200 bg-white">
          <DropdownMenuItem
            className="justify-between rounded-md px-2 py-2 text-sm text-slate-700"
            onClick={() => onChange(ALL_TIME)}
          >
            All time
            {value.kind === "all" && <Check className="size-4 text-blue-600" />}
          </DropdownMenuItem>

          {PRESETS.map((days) => (
            <DropdownMenuItem
              key={days}
              className="justify-between rounded-md px-2 py-2 text-sm text-slate-700"
              onClick={() => onChange({ kind: "days", days })}
            >
              {days === 1 ? "1 day" : `${days} days`}
              {value.kind === "days" && value.days === days && (
                <Check className="size-4 text-blue-600" />
              )}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="justify-between rounded-md px-2 py-2 text-sm text-slate-700"
            onClick={openCustom}
          >
            Custom range…
            {value.kind === "custom" && <Check className="size-4 text-blue-600" />}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isCustomOpen} onOpenChange={setIsCustomOpen}>
        <DialogContent className="rounded-xl border-slate-200 bg-white sm:max-w-md">
          <DialogHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded bg-blue-50 text-blue-600">
              <CalendarRange className="size-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-slate-900">Custom range</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-slate-500">
              Show work orders imported between these two dates. Both days are included.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">Start date</span>
              <Input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setError(null);
                }}
                className="h-[38px] rounded-lg text-sm"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">End date</span>
              <Input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => {
                  setTo(event.target.value);
                  setError(null);
                }}
                className="h-[38px] rounded-lg text-sm"
              />
            </label>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button
              variant="outline"
              className="h-[38px] rounded-lg"
              onClick={() => setIsCustomOpen(false)}
            >
              Cancel
            </Button>
            <Button className="h-[38px] rounded-lg" onClick={applyCustom}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
