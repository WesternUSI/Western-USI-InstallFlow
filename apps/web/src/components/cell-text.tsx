import { cn } from "@usi-installer/ui/lib/utils";

interface CellTextProps {
  value: string | number | undefined;
  /** Shown when the column has no value for this row. */
  fallback?: string;
  className?: string;
}

/**
 * A table cell's text, wrapped rather than clipped.
 *
 * The import tables mirror their source sheets in full, and several of those
 * columns carry long free text — Location, Panel Name, Comments, Install
 * Notes. Nothing is ellipsised: a long value wraps and grows its row, so it
 * can be read outright instead of being hovered or clicked open.
 *
 * `TableCell` sets `whitespace-nowrap`, which is overridden here.
 */
export function CellText({ value, fallback = "—", className }: CellTextProps) {
  const hasValue = value !== undefined && value !== "";

  return (
    <span className={cn("block break-words whitespace-normal", className)}>
      {hasValue ? String(value) : fallback}
    </span>
  );
}
