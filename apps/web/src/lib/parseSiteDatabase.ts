import * as XLSX from "xlsx";

export interface ParsedSiteRow {
  area: string;
  site: string;
  panel_id: string;
  installation_notes?: string;
  equipment: string[];
  panel_qty?: number;
  panel_size?: string;
  line?: string;
  gps_coordinates?: string;
  photo_saved: boolean;
  map_saved: boolean;
}

export interface SkippedRow {
  row: number;
  reason: string;
}

export interface ParseSiteDatabaseResult {
  rows: ParsedSiteRow[];
  skipped: SkippedRow[];
}

const COLUMN_ALIASES: Record<string, keyof ParsedSiteRow | "panel_id_raw"> = {
  location: "area",
  details: "site",
  "panel id": "panel_id",
  qty: "panel_qty",
  size: "panel_size",
  line: "line",
  equipment: "equipment",
  "install notes": "installation_notes",
  "gps co-ordinates": "gps_coordinates",
  "photo saved": "photo_saved",
  "map saved": "map_saved",
};

export function parseSiteDatabase(buffer: ArrayBuffer): ParseSiteDatabaseResult {
  const workbook = XLSX.read(buffer, { type: "array" });
  const grid = findDataSheetGrid(workbook);

  const headerRowIndex = grid.findIndex(
    (row) => Array.isArray(row) && row.some((cell) => normalizeHeader(cell) === "location"),
  );
  if (headerRowIndex === -1) {
    throw new Error("Could not find a header row containing 'LOCATION' in the workbook");
  }

  const headerRow = grid[headerRowIndex];
  const columnMap = new Map<number, string>();
  headerRow.forEach((cell, index) => {
    const field = COLUMN_ALIASES[normalizeHeader(cell)];
    if (field) columnMap.set(index, field);
  });

  if (![...columnMap.values()].includes("panel_id")) {
    throw new Error("Could not find a 'PANEL ID' column in the header row");
  }

  const rows: ParsedSiteRow[] = [];
  const skipped: SkippedRow[] = [];
  const seenPanelIds = new Set<string>();

  for (let i = headerRowIndex + 1; i < grid.length; i++) {
    const raw = grid[i];
    if (!raw || raw.every((cell) => cell === "" || cell == null)) continue;

    const record: Record<string, unknown> = {};
    for (const [colIndex, field] of columnMap) {
      record[field] = raw[colIndex];
    }

    const excelRowNumber = i + 1;
    const panelId = String(record.panel_id ?? "").trim();

    if (!panelId) {
      skipped.push({ row: excelRowNumber, reason: "Missing Panel ID" });
      continue;
    }
    if (seenPanelIds.has(panelId)) {
      skipped.push({
        row: excelRowNumber,
        reason: `Duplicate Panel ID "${panelId}" (first occurrence kept)`,
      });
      continue;
    }
    seenPanelIds.add(panelId);

    rows.push({
      area: String(record.area ?? "").trim(),
      site: String(record.site ?? "").trim(),
      panel_id: panelId,
      installation_notes: toOptionalString(record.installation_notes),
      equipment: toEquipmentList(record.equipment),
      panel_qty: toOptionalNumber(record.panel_qty),
      panel_size: toOptionalString(record.panel_size),
      line: toOptionalString(record.line),
      gps_coordinates: toOptionalString(record.gps_coordinates),
      photo_saved: toBoolean(record.photo_saved),
      map_saved: toBoolean(record.map_saved),
    });
  }

  return { rows, skipped };
}

function findDataSheetGrid(workbook: XLSX.WorkBook): unknown[][] {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: "",
    });
    const hasLocationHeader = grid.some(
      (row) => Array.isArray(row) && row.some((cell) => normalizeHeader(cell) === "location"),
    );
    if (hasLocationHeader) return grid;
  }
  throw new Error("Could not find a sheet with a 'LOCATION' column in the workbook");
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function toOptionalString(value: unknown): string | undefined {
  const str = String(value ?? "").trim();
  return str === "" ? undefined : str;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === "" || value == null) return undefined;
  const num = Number(value);
  return Number.isNaN(num) ? undefined : num;
}

function toBoolean(value: unknown): boolean {
  return String(value ?? "").trim().toLowerCase() === "yes";
}

function toEquipmentList(value: unknown): string[] {
  const str = String(value ?? "").trim();
  if (str === "") return [];
  return str
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}
