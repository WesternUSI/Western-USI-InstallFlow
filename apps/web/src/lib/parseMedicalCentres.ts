import * as XLSX from "xlsx";

import { normalizeHeader, type SkippedRow } from "@/lib/excelParsing";

/** One row of the company's medical centres sheet (decision D13), as the backend stores it. */
export interface MedicalCentreRow {
  listed_suburb: string;
  name: string;
  address: string;
  phone: string;
  hours_weekdays: string;
  hours_saturday: string;
  hours_sunday: string;
  latitude: number;
  longitude: number;
}

/** The sheet's own headings (Mitch's "Medical centres.xlsx"), matched loosely. */
const COLUMNS: Record<keyof Omit<MedicalCentreRow, "latitude" | "longitude"> | "gps", (header: string) => boolean> = {
  listed_suburb: (h) => h.includes("suburb"),
  name: (h) => h.includes("practice") || h === "name",
  address: (h) => h.includes("address"),
  phone: (h) => h.includes("phone"),
  hours_weekdays: (h) => h.startsWith("mon"),
  hours_saturday: (h) => h.startsWith("sat"),
  hours_sunday: (h) => h.startsWith("sun"),
  gps: (h) => h.includes("gps") || h.includes("coordinates"),
};

function clean(value: unknown): string {
  return String(value ?? "")
    .split("\n")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("; ");
}

/**
 * Reads the sheet: finds the heading row (the one with "Practice name"), then
 * every row under it until the first blank one, so notes below the table are
 * left out. Rows without a name or usable GPS are skipped with a reason.
 */
export async function parseMedicalCentres(file: File): Promise<{ rows: MedicalCentreRow[]; skipped: SkippedRow[] }> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

  const headerIndex = grid.findIndex((row) => row.some((cell) => normalizeHeader(cell).includes("practice")));
  if (headerIndex === -1) {
    throw new Error("This sheet has no \"Practice name\" column. Use the medical centres template.");
  }
  const headers = grid[headerIndex].map(normalizeHeader);
  const column = (key: keyof typeof COLUMNS) => headers.findIndex((header) => COLUMNS[key](header));

  const rows: MedicalCentreRow[] = [];
  const skipped: SkippedRow[] = [];
  for (let index = headerIndex + 1; index < grid.length; index++) {
    const cells = grid[index];
    if (cells.every((cell) => clean(cell) === "")) break;
    const name = clean(cells[column("name")]);
    const [lat, lng] = clean(cells[column("gps")]).split(",").map((part) => Number(part.trim()));
    if (name === "") {
      skipped.push({ row: index + 1, reason: "No practice name" });
      continue;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      skipped.push({ row: index + 1, reason: "No usable GPS coordinates" });
      continue;
    }
    rows.push({
      listed_suburb: clean(cells[column("listed_suburb")]),
      name,
      address: clean(cells[column("address")]),
      phone: clean(cells[column("phone")]),
      hours_weekdays: clean(cells[column("hours_weekdays")]),
      hours_saturday: clean(cells[column("hours_saturday")]),
      hours_sunday: clean(cells[column("hours_sunday")]),
      latitude: lat,
      longitude: lng,
    });
  }
  return { rows, skipped };
}
