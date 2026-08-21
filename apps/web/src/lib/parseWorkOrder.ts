import * as XLSX from "xlsx";

import {
  buildColumnMap,
  findDataSheet,
  type SkippedRow,
  toOptionalDateString,
  toOptionalNumber,
  toOptionalString,
} from "@/lib/excelParsing";

export interface ParsedWorkOrderRow {
  contract_id: string;
  advertiser_campaign: string;
  contracted_panel_id: string;
  panel_split: string;
  site: string;
  panel_name: string;
  quantity?: number;
  format?: string;
  size?: string;
  proposed_install_date?: string;
  end_date?: string;
  comments?: string;
  existing_advertiser?: string;
  area_progress?: string;
  schedule?: string;
  priority: boolean;
}

export type { SkippedRow };

export interface ParseWorkOrderResult {
  rows: ParsedWorkOrderRow[];
  skipped: SkippedRow[];
}

/** Every field read from the sheet. `priority` comes from cell fill, not a column. */
type WorkOrderField = Exclude<keyof ParsedWorkOrderRow, "priority">;

/**
 * Spreadsheet header -> field name.
 *
 * Note that PANEL SPLIT, FORMAT and END DATE are hidden columns in the source
 * workbook. Hidden columns still carry their values, so they are read normally.
 */
const COLUMN_ALIASES: Record<string, WorkOrderField> = {
  contract: "contract_id",
  "advertiser / campaign": "advertiser_campaign",
  "contracted panel id": "contracted_panel_id",
  "panel split (if multiple)": "panel_split",
  location: "site",
  "panel name": "panel_name",
  qty: "quantity",
  format: "format",
  "size (w x h)": "size",
  "proposed install date": "proposed_install_date",
  "end date": "end_date",
  comments: "comments",
  "existing advertiser": "existing_advertiser",
  line: "area_progress",
  schedule: "schedule",
};

const RED_FILL_RGB = "FF0000";

export function parseWorkOrder(buffer: ArrayBuffer): ParseWorkOrderResult {
  // `cellDates` is intentionally off — dates are converted from raw serials.
  const workbook = XLSX.read(buffer, { type: "array", cellStyles: true });
  const { sheet, grid } = findDataSheet(workbook, "contracted panel id");
  const { headerRowIndex, columnMap } = buildColumnMap<WorkOrderField>(
    grid,
    COLUMN_ALIASES,
    "contracted panel id",
    "contracted_panel_id",
  );

  const columnCount = grid[headerRowIndex].length;
  const rows: ParsedWorkOrderRow[] = [];
  const skipped: SkippedRow[] = [];
  const seenWholeRows = new Set<string>();

  for (let i = headerRowIndex + 1; i < grid.length; i++) {
    const raw = grid[i];
    if (!raw || raw.every((cell) => cell === "" || cell == null)) continue;

    const excelRow = i + 1;
    const record: Record<string, unknown> = {};
    for (const [colIndex, field] of columnMap) {
      record[field] = raw[colIndex];
    }

    const contractedPanelId = String(record.contracted_panel_id ?? "").trim();

    // The sheet already carries one row per panel, so PANEL SPLIT is used as
    // given. Where it is blank the row covers a single panel, and CONTRACTED
    // PANEL ID is that panel.
    const panelSplit = String(record.panel_split ?? "").trim() || contractedPanelId;

    if (panelSplit === "") {
      skipped.push({ row: excelRow, reason: "Missing both Panel Split and Contracted Panel ID" });
      continue;
    }

    const row: ParsedWorkOrderRow = {
      contract_id: String(record.contract_id ?? "").trim(),
      advertiser_campaign: String(record.advertiser_campaign ?? "").trim(),
      contracted_panel_id: contractedPanelId,
      panel_split: panelSplit,
      site: String(record.site ?? "").trim(),
      panel_name: String(record.panel_name ?? "").trim(),
      quantity: toOptionalNumber(record.quantity),
      format: toOptionalString(record.format),
      size: toOptionalString(record.size),
      proposed_install_date: toOptionalDateString(record.proposed_install_date),
      end_date: toOptionalDateString(record.end_date),
      comments: toOptionalString(record.comments),
      existing_advertiser: toOptionalString(record.existing_advertiser),
      area_progress: toOptionalString(record.area_progress),
      schedule: toOptionalString(record.schedule),
      priority: isRowPriority(sheet, i, columnCount),
    };

    // Remove duplicates based on whole rows.
    const wholeRowKey = JSON.stringify(row);
    if (seenWholeRows.has(wholeRowKey)) {
      skipped.push({ row: excelRow, reason: "Duplicate of an earlier identical row" });
      continue;
    }
    seenWholeRows.add(wholeRowKey);

    rows.push(row);
  }

  return { rows, skipped };
}

/**
 * A row is priority when it is highlighted red. Blank cells are ignored,
 * because the fill is applied to the visible content rather than the full
 * width of the sheet — so "the whole row is red" means every cell that has
 * content is red.
 */
function isRowPriority(sheet: XLSX.WorkSheet, rowIndex: number, columnCount: number): boolean {
  let filledCells = 0;

  for (let col = 0; col < columnCount; col++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: col })];
    if (cell == null || cell.v === "" || cell.v == null) continue;

    filledCells++;
    const fgColor = cell.s?.fgColor?.rgb;
    if (typeof fgColor !== "string" || !fgColor.toUpperCase().endsWith(RED_FILL_RGB)) {
      return false;
    }
  }

  return filledCells > 0;
}
