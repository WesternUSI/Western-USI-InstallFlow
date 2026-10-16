import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

/** One table of a report: a PDF section, or one sheet in Excel. */
export interface ReportTable {
  heading: string;
  columns: string[];
  rows: (string | number)[][];
}

/** A finished report (framework 12), ready to save as PDF or Excel. */
export interface Report {
  title: string;
  /** Short lines under the title: entity, period, when and by whom it was made. */
  lines: string[];
  tables: ReportTable[];
  /** Without the extension. */
  fileName: string;
}

/** A4 landscape: title, the lines under it, then each table with its heading; page numbers at the foot. */
export function downloadPdf(report: Report) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margin = 36;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39);
  doc.text(report.title, margin, margin + 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  report.lines.forEach((line, index) => doc.text(line, margin, margin + 26 + index * 12));

  let y = margin + 26 + report.lines.length * 12 + 10;
  for (const table of report.tables) {
    if (report.tables.length > 1) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(17, 24, 39);
      doc.text(table.heading, margin, y + 8);
      y += 16;
    }
    autoTable(doc, {
      startY: y,
      head: [table.columns],
      body: table.rows.length === 0 ? [[{ content: "Nothing to show.", colSpan: table.columns.length }]] : table.rows,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 4, textColor: [51, 65, 85], lineColor: [226, 232, 240], lineWidth: 0.5 },
      headStyles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontStyle: "bold" },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 20;
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`${report.title} · Page ${page} of ${pages}`, margin, doc.internal.pageSize.getHeight() - 18);
  }
  doc.save(`${report.fileName}.pdf`);
}

/** One sheet per table, headings in the first row, columns sized to their content. */
export function downloadExcel(report: Report) {
  const workbook = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const table of report.tables) {
    const sheet = XLSX.utils.aoa_to_sheet([table.columns, ...table.rows]);
    sheet["!cols"] = table.columns.map((column, index) => ({
      wch: Math.min(60, Math.max(column.length, ...table.rows.map((row) => String(row[index] ?? "").length)) + 2),
    }));
    // Excel sheet names: up to 31 characters, no []:*?/\ and unique.
    let name = table.heading.replace(/[[\]:*?/\\]/g, " ").slice(0, 31);
    for (let count = 2; used.has(name); count++) name = `${name.slice(0, 28)} ${count}`;
    used.add(name);
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }
  XLSX.writeFile(workbook, `${report.fileName}.xlsx`);
}
