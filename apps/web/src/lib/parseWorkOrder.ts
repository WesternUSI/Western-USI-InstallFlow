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

/**
 * How red a fill has to be to mean priority.
 *
 * Matching one exact hex did not survive contact with real sheets: whoever
 * highlights a row picks whatever red is in front of them that day, so pure
 * FF0000, the darker C00000, a pale FFC7CE and everything between all turn up.
 * The test is therefore on hue rather than an exact value.
 *
 * Saturation rules out greys, and the lightness bounds rule out near-black and
 * near-white, so an unfilled or plain cell cannot read as a faint red.
 */
const RED_HUE_START = 335;
const RED_HUE_END = 20;
const RED_MIN_SATURATION = 0.2;
const RED_MIN_LIGHTNESS = 0.12;
const RED_MAX_LIGHTNESS = 0.93;

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
 * The cell fill, as six hex digits, or null when the sheet does not say.
 *
 * A solid fill puts the colour on `fgColor`; `bgColor` is the fallback for
 * pattern fills. Values arrive as either RRGGBB or ARGB, hence the trim.
 *
 * A fill defined as a theme colour rather than a literal one has no `rgb` at
 * all, and reads as null — see the note on `isRowPriority`.
 */
function fillRgb(cell: XLSX.CellObject): string | null {
  const raw = cell.s?.fgColor?.rgb ?? cell.s?.bgColor?.rgb;
  if (typeof raw !== "string") return null;

  const hex = raw.length === 8 ? raw.slice(2) : raw;
  return hex.length === 6 ? hex.toUpperCase() : null;
}

/** Hue in degrees, saturation and lightness in 0..1. */
function toHsl(hex: string): { h: number; s: number; l: number } {
  const r = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const g = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const b = Number.parseInt(hex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));

  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;

  h *= 60;
  if (h < 0) h += 360;

  return { h, s, l };
}

function isRedFill(cell: XLSX.CellObject): boolean {
  const hex = fillRgb(cell);
  if (hex === null) return false;

  const { h, s, l } = toHsl(hex);
  return (
    (h >= RED_HUE_START || h <= RED_HUE_END) &&
    s >= RED_MIN_SATURATION &&
    l >= RED_MIN_LIGHTNESS &&
    l <= RED_MAX_LIGHTNESS
  );
}

/**
 * A row is priority when any cell in it is filled red.
 *
 * Any, not all: highlighting is done by hand, and a row often ends up with the
 * fill on one cell — the contract number, or whichever column the person was
 * looking at. Requiring the whole row missed those, which is the case this
 * replaced.
 *
 * Known limit: a fill set from a theme colour rather than a literal one has no
 * RGB in the sheet, so it cannot be read and the row will not be flagged. The
 * admin can switch priority on by hand for those.
 */
function isRowPriority(sheet: XLSX.WorkSheet, rowIndex: number, columnCount: number): boolean {
  for (let col = 0; col < columnCount; col++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: col })];
    if (cell == null) continue;
    if (isRedFill(cell)) return true;
  }

  return false;
}
