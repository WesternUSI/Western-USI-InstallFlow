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
