import { Badge } from "@usi-installer/ui/components/badge";
import { AlertTriangle, FileSpreadsheet } from "lucide-react";

interface ImportSummaryCardProps {
  name: string;
  /** e.g. "608 Orders" or "608 Rows". */
  badgeText: string;
  /** Meta lines under the name, such as the source file and who uploaded it. */
  lines?: string[];
  /**
   * Right-hand totals. Only the work order import reports unmatched sites, so
   * the site database import omits this block entirely.
   */
  stats?: { totalRows: number; missingSites: number };
}

/**
 * Summary of one import — used for the last saved import on the dashboard and
 * Manage Site Data, and for the pending import on both review screens.
 */
export function ImportSummaryCard({ name, badgeText, lines, stats }: ImportSummaryCardProps) {
  const missingSites = stats?.missingSites ?? 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded bg-green-50 text-green-600">
            <FileSpreadsheet className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-base font-bold text-gray-900">{name}</p>
              <Badge className="rounded-full bg-green-50 px-2.5 text-xs font-medium text-green-700">
                {badgeText}
              </Badge>
            </div>
            {lines?.map((line) => (
              <p key={line} className="mt-0.5 truncate text-sm text-gray-500">
                {line}
              </p>
            ))}
          </div>
        </div>

        {stats && (
          <div className="flex items-center gap-10">
            <div className="text-right">
              <p className="text-[11px] font-bold tracking-[0.55px] text-slate-500 uppercase">
                Total Rows
              </p>
              <p className="text-xl font-bold text-gray-900">
                {stats.totalRows.toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-bold tracking-[0.55px] text-slate-500 uppercase">
                Missing Sites
              </p>
              <p
                className={
                  missingSites > 0
                    ? "text-xl font-bold text-red-600"
                    : "text-xl font-bold text-gray-900"
                }
              >
                {missingSites}
              </p>
            </div>
          </div>
        )}
      </div>

      {stats && missingSites > 0 && (
        <div className="flex items-start gap-3 border-t border-amber-100 bg-amber-50/70 px-6 py-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <div className="text-sm leading-relaxed">
            <p className="font-medium text-amber-900">
              {missingSites} work order{missingSites === 1 ? "" : "s"} could not be matched with a
              site.
            </p>
            <p className="text-amber-800/80">
              Review and add the missing site matches in the excel sheet, and then import again to
              get updated work orders.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
