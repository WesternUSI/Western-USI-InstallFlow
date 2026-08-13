import excelIcon from "@/assets/excel-icon.png";

/**
 * The Excel file icon, used wherever a spreadsheet file is represented. It is a
 * full-colour mark, so unlike the lucide line icons it needs no tinted square
 * behind it.
 */
export function ExcelIcon({ className }: { className?: string }) {
  return <img src={excelIcon} alt="" aria-hidden="true" className={className} />;
}
