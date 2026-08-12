import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usi-installer/ui/components/select";

interface FilterSelectProps {
  /** Small caps label that sits on the border, as in the design. */
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Filter dropdown for the table toolbars.
 *
 * `alignItemWithTrigger` is off so the list opens below the control instead of
 * stretching to line the selected row up with it — with a few hundred
 * locations that behaviour runs the popup off the page. The height is capped so
 * long lists scroll inside the popup.
 */
export function FilterSelect({ label, value, options, onChange, className }: FilterSelectProps) {
  const selected = options.find((option) => option.value === value);

  return (
    <div className={`relative ${className ?? ""}`}>
      <span className="absolute -top-2 left-3 z-10 bg-white px-1 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
        {label}
      </span>
      <Select value={value} onValueChange={(next) => onChange(next as string)}>
        <SelectTrigger className="h-[38px] w-48 rounded-lg border-slate-300 bg-white px-3 text-sm text-slate-800">
          <SelectValue>{selected?.label ?? ""}</SelectValue>
        </SelectTrigger>
        <SelectContent
          alignItemWithTrigger={false}
          align="start"
          className="max-h-72 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="rounded-md px-3 py-2 text-sm text-slate-700"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
