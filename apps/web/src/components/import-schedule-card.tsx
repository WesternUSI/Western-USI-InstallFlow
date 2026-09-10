import { Input } from "@usi-installer/ui/components/input";
import { cn } from "@usi-installer/ui/lib/utils";
import { CalendarClock, Upload } from "lucide-react";

/** Long form of a YYYY-MM-DD date, e.g. "Tue, 15 Sep 2026". */
export function formatReleaseDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-AU", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface ImportScheduleCardProps {
  /** null imports straight away; a YYYY-MM-DD date schedules for that day. */
  value: string | null;
  /** Earliest selectable date — tomorrow, in the release zone. */
  minDate: string;
  disabled?: boolean;
  onChange: (value: string | null) => void;
}

function Option({
  icon: Icon,
  title,
  description,
  selected,
  disabled,
  onSelect,
}: {
  icon: typeof Upload;
  title: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
        selected
          ? "border-blue-600 bg-blue-50/60"
          : "border-slate-200 bg-white hover:border-slate-300",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", selected ? "text-blue-600" : "text-slate-400")} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{description}</span>
      </span>
    </button>
  );
}

/**
 * Picks when an uploaded schedule goes live.
 *
 * Importing now is the default and runs the import the way it always has. A
 * date instead parks the whole batch until midnight on that day, which is what
 * lets several weeks be uploaded at once without the installers seeing them.
 */
export function ImportScheduleCard({
  value,
  minDate,
  disabled,
  onChange,
}: ImportScheduleCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <p className="text-base font-bold text-gray-900">When should these go live?</p>
        <p className="mt-0.5 text-sm text-gray-500">
          A scheduled batch stays hidden from installers and from the work order screens until its
          release date.
        </p>
      </div>

      <div className="grid gap-3 px-6 py-4 sm:grid-cols-2" role="radiogroup">
        <Option
          icon={Upload}
          title="Import now"
          description="Work orders appear immediately."
          selected={value === null}
          disabled={disabled}
          onSelect={() => onChange(null)}
        />
        <Option
          icon={CalendarClock}
          title="Schedule for later"
          description="Held back until a date you choose."
          selected={value !== null}
          disabled={disabled}
          onSelect={() => onChange(value ?? minDate)}
        />
      </div>

      {value !== null && (
        <div className="flex flex-wrap items-end gap-4 border-t border-slate-100 px-6 py-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Release date</span>
            <Input
              type="date"
              value={value}
              min={minDate}
              disabled={disabled}
              onChange={(event) => onChange(event.target.value || minDate)}
              className="h-[38px] w-48 rounded-lg text-sm"
            />
          </label>
          <p className="pb-2 text-sm text-slate-500">
            Goes live at midnight on {formatReleaseDate(value)}, Sydney time.
          </p>
        </div>
      )}
    </div>
  );
}
