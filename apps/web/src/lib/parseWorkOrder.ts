import * as XLSX from "xlsx";

import {
  findDataSheet,
  normalizeHeader,
  type SkippedRow,
  toOptionalNumber,
  toOptionalString,
} from "@/lib/excelParsing";

export interface ParsedWorkOrderRow {
  advertiser_campaign: string;
  contracted_panel_id: string;
  panel_split?: string;
  location: string;
  panel_name: string;
  qty?: number;
  format?: string;
  size?: string;
  proposed_install_date?: string;
  end_date?: string;
  comments?: string;
  existing_advertiser?: string;
  priority: boolean;
}

export type { SkippedRow };

export interface ParseWorkOrderResult {
  rows: ParsedWorkOrderRow[];
  skipped: SkippedRow[];
}

const COLUMN_ALIASES: Record<string, keyof ParsedWorkOrderRow> = {
  "advertiser / campaign": "advertiser_campaign",
  "contracted panel id": "contracted_panel_id",
  "panel split (if multiple)": "panel_split",
  location: "location",
  "panel name": "panel_name",
  qty: "qty",
  format: "format",
  "size (w x h)": "size",
  "proposed install date": "proposed_install_date",
  "end date": "end_date",
  comments: "comments",
  "existing advertiser": "existing_advertiser",
};

const RED_FILL_RGB = "FF0000";

export function parseWorkOrder(buffer: ArrayBuffer): ParseWorkOrderResult {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, cellStyles: true });
  const { sheet, grid } = findDataSheet(workbook, "contracted panel id");

  const headerRowIndex = grid.findIndex(
    (row) => Array.isArray(row) && row.some((cell) => normalizeHeader(cell) === "contracted panel id"),
  );
  if (headerRowIndex === -1) {
    throw new Error("Could not find a header row containing 'CONTRACTED PANEL ID' in the workbook");
  }

  const headerRow = grid[headerRowIndex];
  const columnMap = new Map<number, keyof ParsedWorkOrderRow>();
  headerRow.forEach((cell, index) => {
    const field = COLUMN_ALIASES[normalizeHeader(cell)];
    if (field) columnMap.set(index, field);
  });

  if (![...columnMap.values()].includes("contracted_panel_id")) {
    throw new Error("Could not find a 'CONTRACTED PANEL ID' column in the header row");
  }

  const rows: ParsedWorkOrderRow[] = [];
  const skipped: SkippedRow[] = [];

  for (let i = headerRowIndex + 1; i < grid.length; i++) {
    const raw = grid[i];
    if (!raw || raw.every((cell) => cell === "" || cell == null)) continue;

    const excelRowNumber = i + 1;
    const record: Record<string, unknown> = {};
    for (const [colIndex, field] of columnMap) {
      record[field] = raw[colIndex];
    }

    const contractedPanelId = String(record.contracted_panel_id ?? "").trim();
    if (!contractedPanelId) {
      skipped.push({ row: excelRowNumber, reason: "Missing Contracted Panel ID" });
      continue;
    }

    rows.push({
      advertiser_campaign: String(record.advertiser_campaign ?? "").trim(),
      contracted_panel_id: contractedPanelId,
      panel_split: toOptionalString(record.panel_split),
      location: String(record.location ?? "").trim(),
      panel_name: String(record.panel_name ?? "").trim(),
      qty: toOptionalNumber(record.qty),
      format: toOptionalString(record.format),
      size: toOptionalString(record.size),
      proposed_install_date: toOptionalDateString(record.proposed_install_date),
      end_date: toOptionalDateString(record.end_date),
      comments: toOptionalString(record.comments),
      existing_advertiser: toOptionalString(record.existing_advertiser),
      priority: isRowPriority(sheet, i, raw.length),
    });
  }

  return { rows, skipped };
}

/** A row is priority if any of its cells has a solid red (FF0000) fill, matching the source file's manual red-highlight convention. */
function isRowPriority(sheet: XLSX.WorkSheet, rowIndex: number, columnCount: number): boolean {
  for (let col = 0; col < columnCount; col++) {
    const address = XLSX.utils.encode_cell({ r: rowIndex, c: col });
    const cell = sheet[address];
    const fgColor = cell?.s?.fgColor?.rgb;
    if (typeof fgColor === "string" && fgColor.toUpperCase().endsWith(RED_FILL_RGB)) {
      return true;
    }
  }
  return false;
}

function toOptionalDateString(value: unknown): string | undefined {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return toOptionalString(value);
}
