import * as XLSX from "xlsx";

import { normalizeHeader, toOptionalDateString, type SkippedRow } from "@/lib/excelParsing";

/** One row of Mitch's "Height and Safety Equipment register" sheet (decision AD49), as the backend takes it. */
export interface EquipmentRow {
  type: string;
  brand: string;
  name: string;
  damage?: string;
  repair_history?: string;
  out_of_service_date?: string;
  last_updated?: string;
}

/** The sheet's own headings, matched loosely. Its untitled column is left out. */
const COLUMNS: Record<keyof EquipmentRow, (header: string) => boolean> = {
  type: (h) => h === "type",
  brand: (h) => h === "brand",
  name: (h) => h.startsWith("name"),
  damage: (h) => h === "damage",
  repair_history: (h) => h.includes("repair"),
  out_of_service_date: (h) => h.includes("out of service"),
  last_updated: (h) => h.includes("last updated"),
};

function clean(value: unknown): string | undefined {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text === "" ? undefined : text;
}

/** Reads the sheet: finds the heading row (the one with "Type" and "Brand"), then every non-blank row under it. */
export async function parseEquipment(file: File): Promise<{ rows: EquipmentRow[]; skipped: SkippedRow[] }> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });

  const headerIndex = grid.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    return headers.includes("type") && headers.includes("brand");
  });
  if (headerIndex === -1) {
    throw new Error('This sheet has no "Type" and "Brand" columns. Use the height and safety equipment register.');
  }
  const headers = grid[headerIndex].map(normalizeHeader);
  const column = (key: keyof EquipmentRow) => headers.findIndex((header) => COLUMNS[key](header));
  const cell = (cells: unknown[], key: keyof EquipmentRow) => (column(key) === -1 ? undefined : cells[column(key)]);
  const date = (value: unknown) => (value === undefined || value === "" ? undefined : clean(toOptionalDateString(value)));

  const rows: EquipmentRow[] = [];
  const skipped: SkippedRow[] = [];
  for (let index = headerIndex + 1; index < grid.length; index++) {
    const cells = grid[index];
    if (cells.every((value) => clean(value) === undefined)) continue;
    const type = clean(cell(cells, "type"));
    const name = clean(cell(cells, "name"));
    if (type === undefined || name === undefined) {
      skipped.push({ row: index + 1, reason: type === undefined ? "No type" : "No name / number" });
      continue;
    }
    rows.push({
      type,
      brand: clean(cell(cells, "brand")) ?? "",
      name,
      damage: clean(cell(cells, "damage")),
      repair_history: clean(cell(cells, "repair_history")),
      out_of_service_date: date(cell(cells, "out_of_service_date")),
      last_updated: date(cell(cells, "last_updated")),
    });
  }
  return { rows, skipped };
}
