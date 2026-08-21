import { Input } from "@usi-installer/ui/components/input";
import { Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

export interface SearchOption {
  value: string;
  kind: string;
}

interface SearchInputProps {
  value: string;
  placeholder: string;
  /** Distinct values to suggest. Filtered in the browser, never per keystroke on the server. */
  options: SearchOption[] | undefined;
  onChange: (value: string) => void;
  className?: string;
}

const MAX_SUGGESTIONS = 8;

/** Ranks prefix matches above matches in the middle of a value. */
function rank(option: SearchOption, needle: string): number | null {
  const index = option.value.toLowerCase().indexOf(needle);
  if (index === -1) return null;
  return index === 0 ? 0 : 1;
}

export function SearchInput({
  value,
  placeholder,
  options,
  onChange,
  className,
}: SearchInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const suggestions = useMemo(() => {
    const needle = value.trim().toLowerCase();
    if (needle === "" || options === undefined) return [];

    return options
      .map((option) => ({ option, score: rank(option, needle) }))
      .filter((entry): entry is { option: SearchOption; score: number } => entry.score !== null)
      // Exact match is already typed out — suggesting it adds nothing.
      .filter((entry) => entry.option.value.toLowerCase() !== needle)
      .sort((a, b) => a.score - b.score || a.option.value.localeCompare(b.option.value))
      .slice(0, MAX_SUGGESTIONS)
      .map((entry) => entry.option);
  }, [options, value]);

  const showList = isOpen && suggestions.length > 0;

  function choose(option: SearchOption) {
    onChange(option.value);
    setIsOpen(false);
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-slate-400" />
      <Input
        value={value}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        className="h-[38px] rounded-lg pr-9 pl-10 text-sm"
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
          setHighlighted(0);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          // Deferred so a click on a suggestion lands before the list closes.
          blurTimer.current = setTimeout(() => setIsOpen(false), 120);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false);
            return;
          }
          if (!showList) return;

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlighted((current) => (current + 1) % suggestions.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlighted((current) => (current - 1 + suggestions.length) % suggestions.length);
          } else if (event.key === "Enter") {
            event.preventDefault();
            choose(suggestions[highlighted]);
          }
        }}
      />

      {value !== "" && (
        <button
          type="button"
          aria-label="Clear search"
          className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          onClick={() => {
            onChange("");
            setIsOpen(false);
          }}
        >
          <X className="size-4" />
        </button>
      )}

      {showList && (
        <ul className="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {suggestions.map((option, index) => (
            <li key={`${option.kind}:${option.value}`}>
              <button
                type="button"
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                  index === highlighted ? "bg-slate-100" : "hover:bg-slate-50"
                }`}
                onMouseEnter={() => setHighlighted(index)}
                onMouseDown={() => clearTimeout(blurTimer.current)}
                onClick={() => choose(option)}
              >
                <span className="truncate text-slate-700">{option.value}</span>
                <span className="shrink-0 text-xs text-slate-400">{option.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
