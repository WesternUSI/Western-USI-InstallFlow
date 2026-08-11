import * as XLSX from "xlsx";

export interface SkippedRow {
  row: number;
  reason: string;
}

export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function toOptionalString(value: unknown): string | undefined {
  const str = String(value ?? "").trim();
  return str === "" ? undefined : str;
}

export function toOptionalNumber(value: unknown): number | undefined {
  if (value === "" || value == null) return undefined;
  const num = Number(value);
  return Number.isNaN(num) ? undefined : num;
}

/**
 * Converts an Excel date cell to `YYYY-MM-DD`.
 *
 * Dates are read as raw serial numbers rather than with `cellDates`, because
 * `cellDates` builds a local-time `Date` whose UTC calendar day can be the day
 * before the one Excel displays (serial 46258 shows as 24/08/2026 but yields
 * 2026-08-23T18:59:48Z). `SSF.parse_date_code` reads the calendar parts off the
 * serial directly, so no timezone is involved.
 */
export function toOptionalDateString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parts = XLSX.SSF.parse_date_code(value);
    if (parts && parts.y) {
      const month = String(parts.m).padStart(2, "0");
      const day = String(parts.d).padStart(2, "0");
      return `${parts.y}-${month}-${day}`;
    }
  }
  if (value instanceof Date) {
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${value.getFullYear()}-${month}-${day}`;
  }
  return toOptionalString(value);
}

/** Today's date as `YYYY-MM-DD` in the uploader's local timezone. */
export function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * True when an id cell holds a placeholder rather than a real id — e.g. "???"
 * or "-". Such rows are kept but flagged with `missing_value`.
 */
export function isPlaceholderId(value: string): boolean {
  return !/[a-z0-9]/i.test(value);
}

/** Splits a comma-separated cell into a trimmed list: "Step, Towel" -> ["Step", "Towel"]. */
export function toCommaSeparatedList(value: unknown): string[] {
  const str = String(value ?? "").trim();
  if (str === "") return [];
  return str
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

/** Finds the first sheet whose header row contains `requiredHeader` (normalized), returning both the raw sheet (for cell-level lookups like styles) and its header:1 grid. */
export function findDataSheet(
  workbook: XLSX.WorkBook,
  requiredHeader: string,
): { sheet: XLSX.WorkSheet; grid: unknown[][] } {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: "",
    });
    const hasHeader = grid.some(
      (row) => Array.isArray(row) && row.some((cell) => normalizeHeader(cell) === requiredHeader),
    );
    if (hasHeader) return { sheet, grid };
  }
  throw new Error(
    `Could not find a sheet with a '${requiredHeader.toUpperCase()}' column in the workbook`,
  );
}

/** Locates the header row within a grid and maps column index -> field name. */
export function buildColumnMap<TField extends string>(
  grid: unknown[][],
  aliases: Record<string, TField>,
  requiredHeader: string,
  requiredField: TField,
): { headerRowIndex: number; columnMap: Map<number, TField> } {
  const headerRowIndex = grid.findIndex(
    (row) => Array.isArray(row) && row.some((cell) => normalizeHeader(cell) === requiredHeader),
  );
  if (headerRowIndex === -1) {
    throw new Error(
      `Could not find a header row containing '${requiredHeader.toUpperCase()}' in the workbook`,
    );
  }

  const columnMap = new Map<number, TField>();
  grid[headerRowIndex].forEach((cell, index) => {
    const field = aliases[normalizeHeader(cell)];
    if (field) columnMap.set(index, field);
  });

  if (![...columnMap.values()].includes(requiredField)) {
    throw new Error(`Could not find a '${requiredHeader.toUpperCase()}' column in the header row`);
  }

  return { headerRowIndex, columnMap };
}
