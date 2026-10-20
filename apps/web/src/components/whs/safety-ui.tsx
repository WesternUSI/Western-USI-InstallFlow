import { useState } from "react";
import { Link, type LinkProps, useCanGoBack, useRouter } from "@tanstack/react-router";
import { cn } from "@usi-installer/ui/lib/utils";
import { ArrowRight, ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/page-header";

/**
 * The building blocks of the admin Safety screens, in the Figma's "USI /
 * Safety" style: 42px buttons with 6px corners, 10px-rounded white cards, and
 * tables with small uppercase headings.
 */

type To = NonNullable<LinkProps["to"]>;

/**
 * Page header plus the padded body every Safety screen shares. The "‹" link
 * goes back to wherever the user came from (with its filters and page) when
 * they came from inside the app; opened directly, it goes to `back.to`.
 */
export function SafetyPage({
  title,
  description,
  back,
  action,
  hideBell,
  children,
}: {
  title: string;
  description: string;
  back?: { to: To; label: string; params?: Record<string, string>; search?: Record<string, string> };
  /** The page's main action, shown in the header. */
  action?: ReactNode;
  /** Leaves out the notification bell (the management dashboard). */
  hideBell?: boolean;
  children: ReactNode;
}) {
  const canGoBack = useCanGoBack();
  const router = useRouter();
  const linkClass = "w-fit text-[13px] font-semibold text-[#2563eb] hover:underline";

  return (
    <>
      <PageHeader title={title} description={description} action={action} hideBell={hideBell} />
      <div className="flex flex-col gap-[22px] p-4 sm:p-6 lg:p-8">
        {back &&
          (canGoBack ? (
            <button type="button" onClick={() => router.history.back()} className={linkClass}>
              ‹&nbsp;&nbsp;Back
            </button>
          ) : (
            <Link to={back.to} params={back.params as never} search={back.search as never} className={linkClass}>
              ‹&nbsp;&nbsp;{back.label}
            </Link>
          ))}
        {children}
      </div>
    </>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-[17px] font-semibold text-[#111827]">{children}</h2>;
}

/** White card with the Safety border and corners. */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn("overflow-hidden rounded-[10px] border border-[#e5e7eb] bg-white", className)}>
      {children}
    </section>
  );
}

const buttonBase =
  "inline-flex h-[42px] items-center justify-center gap-2 rounded-[6px] px-4 text-[13px] font-semibold whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50";
const buttonVariants = {
  primary: "bg-[#2563eb] text-white hover:bg-[#1d4ed8]",
  secondary: "border border-[#e5e7eb] bg-white text-[#2563eb] hover:bg-[#f8fafc]",
  danger: "border border-[#fecaca] bg-white text-[#dc2626] hover:bg-[#fef2f2]",
} as const;

/** A Safety button. With `to` it renders a link that looks like the button. */
export function SafetyButton({
  variant = "primary",
  to,
  params,
  search,
  onClick,
  type = "button",
  disabled,
  className,
  children,
}: {
  variant?: keyof typeof buttonVariants;
  to?: To;
  params?: Record<string, string>;
  search?: Record<string, string>;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const classes = cn(buttonBase, buttonVariants[variant], className);
  if (to) {
    return (
      <Link to={to} params={params as never} search={search as never} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    // biome-ignore lint/a11y/useButtonType: `type` is always one of the two allowed values.
    <button type={type} onClick={onClick} disabled={disabled} className={classes}>
      {children}
    </button>
  );
}

/** The small bordered link button used in table action columns ("Open", "Renew"). */
export function RowAction({
  to,
  params,
  onClick,
  children,
}: {
  to?: To;
  params?: Record<string, string>;
  onClick?: () => void;
  children: ReactNode;
}) {
  const classes =
    "inline-flex h-8 items-center rounded-[4px] border border-[#bfdbfe] px-[13px] text-xs font-semibold text-[#2563eb] hover:bg-[#eff6ff]";
  if (to) {
    return (
      <Link to={to} params={params as never} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {children}
    </button>
  );
}

/** A headline number on a dashboard. Clickable when it leads to the list behind it (framework 9). */
export function StatCard({
  label,
  value,
  hint,
  tone = "blue",
  to,
  search,
}: {
  label: string;
  value: number | string;
  hint: string;
  tone?: "blue" | "red" | "amber" | "green";
  to?: To;
  search?: Record<string, string>;
}) {
  const colour = {
    blue: "text-[#2563eb]",
    red: "text-[#dc2626]",
    amber: "text-[#d97706]",
    green: "text-[#16a34a]",
  }[tone];
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-[#64748b]">{label}</p>
        {to ? (
          <ArrowRight className="size-4 shrink-0 text-[#94a3b8] transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-[#2563eb]" />
        ) : null}
      </div>
      <p className={cn("text-[30px] leading-[1.45] font-bold", colour)}>{value}</p>
      <p className="text-[11px] text-[#64748b]">{hint}</p>
    </>
  );
  const classes = "flex flex-col gap-[5px] rounded-[10px] border border-[#e5e7eb] bg-white p-[18px] text-left";
  return to ? (
    <Link
      to={to}
      search={search as never}
      className={cn(
        classes,
        "group transition-all duration-150 hover:-translate-y-0.5 hover:border-[#93c5fd] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]",
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

export type SafetyStatus =
  | "current"
  | "due-soon"
  | "overdue"
  | "expired"
  | "missing"
  | "action-required"
  | "awaiting-verification"
  | "renewal-in-progress"
  | "out-of-service"
  | "superseded"
  | "verified"
  | "rejected";

const STATUS: Record<SafetyStatus, { label: string; className: string }> = {
  current: { label: "Current", className: "bg-[#dcfce7] text-[#166534]" },
  verified: { label: "Verified", className: "bg-[#dcfce7] text-[#166534]" },
  "due-soon": { label: "Due Soon", className: "bg-[#fcfcdc] text-[#bb7e23]" },
  overdue: { label: "Overdue", className: "bg-[#fcdcdd] text-[#b71d1f]" },
  expired: { label: "Expired", className: "bg-[#fcdcdd] text-[#b71d1f]" },
  missing: { label: "Missing", className: "bg-[#fcdcdd] text-[#b71d1f]" },
  "action-required": { label: "Action Required", className: "bg-[#fcdcdd] text-[#b71d1f]" },
  rejected: { label: "Rejected", className: "bg-[#fcdcdd] text-[#b71d1f]" },
  "out-of-service": { label: "Out of Service", className: "bg-[#fcdcdd] text-[#b71d1f]" },
  "awaiting-verification": { label: "Awaiting Verification", className: "bg-[#fcfcdc] text-[#bb7e23]" },
  "renewal-in-progress": { label: "Renewal in Progress", className: "bg-[#eff6ff] text-[#1d4ed8]" },
  superseded: { label: "Superseded", className: "bg-[#f1f5f9] text-[#475569]" },
};

/** A status in words, as its badge shows it (for exports). */
export const statusText = (status: SafetyStatus, label?: string) => label ?? STATUS[status].label;

export function StatusBadge({ status, label }: { status: SafetyStatus; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-[6px] px-2.5 text-[13px] font-medium whitespace-nowrap",
        STATUS[status].className,
      )}
    >
      {label ?? STATUS[status].label}
    </span>
  );
}

export function statusLabel(status: SafetyStatus) {
  return STATUS[status].label;
}

export interface Column<Row> {
  key: string;
  header: string;
  align?: "left" | "right";
  className?: string;
  render: (row: Row) => ReactNode;
}

/** The Safety data table: grey uppercase heading row, 65px rows, light dividers. */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  empty = "No records match.",
}: {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  empty?: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead className="bg-[#f9fafb]">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  "px-6 py-3 text-xs font-semibold tracking-[0.6px] whitespace-nowrap text-[#6b7280] uppercase",
                  column.align === "right" && "text-right",
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-t border-[#f3f4f6]">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "h-[65px] px-6 text-sm font-medium text-[#6b7280]",
                    column.align === "right" && "text-right",
                    column.className,
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr className="border-t border-[#f3f4f6]">
              <td colSpan={columns.length} className="px-6 py-10 text-center text-sm text-[#6b7280]">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** The pages to number in the pager: all of them when few, else first, last and the ones around the current one. */
function pageNumbers(page: number, pageCount: number): (number | "…")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const around = [page - 1, page, page + 1].filter((value) => value > 1 && value < pageCount);
  const result: (number | "…")[] = [1];
  if (around[0] > 2) result.push("…");
  result.push(...around);
  if (around[around.length - 1] < pageCount - 1) result.push("…");
  result.push(pageCount);
  return result;
}

/** "Showing 21 to 40 of 86 records" and a working pager (Figma A2's footer). */
export function TableFooter({
  page,
  pageSize,
  total,
  onPage,
  noun = "records",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  noun?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const arrow = "flex items-center border border-[#d1d5db] bg-white px-[13px] text-[#6b7280] enabled:hover:bg-[#f9fafb] disabled:text-[#d1d5db]";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f3f4f6] px-6 pt-[17px] pb-4">
      <p className="text-sm font-semibold text-[#6b7280]">
        Showing {first} to {last} of {total} {noun}
      </p>
      <nav aria-label="Pages" className="flex h-[38px] items-stretch">
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} className={cn(arrow, "rounded-l-[6px]")}>
          <ChevronLeft className="size-4" />
        </button>
        {pageNumbers(page, pageCount).map((value, index) =>
          value === "…" ? (
            <span key={`gap-${index}`} className="flex items-center border-y border-[#d1d5db] bg-white px-3 text-sm text-[#6b7280]">
              …
            </span>
          ) : (
            <button
              key={value}
              type="button"
              aria-current={value === page ? "page" : undefined}
              onClick={() => onPage(value)}
              className={cn(
                "flex min-w-10 items-center justify-center border-y px-3 text-sm",
                value === page
                  ? "border-x border-[#3b82f6] bg-[#eff6ff] font-bold text-[#2563eb]"
                  : "border-[#d1d5db] bg-white text-[#374151] hover:bg-[#f9fafb]",
              )}
            >
              {value}
            </button>
          ),
        )}
        <button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => onPage(page + 1)} className={cn(arrow, "rounded-r-[6px]")}>
          <ChevronRight className="size-4" />
        </button>
      </nav>
    </div>
  );
}

/**
 * A Safety table with paging in the browser, 20 rows a page. The rows are
 * already loaded, so this only slices them. A list page passes the page from
 * its address (`useListState`), so going back returns to the same page; a
 * table without `page` keeps its own (pages with several tables).
 */
export function PagedTable<Row>({
  rows,
  columns,
  rowKey,
  empty,
  noun,
  page: pageProp,
  onPage: onPageProp,
  pageSize = 20,
}: {
  rows: Row[];
  columns: Column<Row>[];
  rowKey: (row: Row) => string;
  empty?: ReactNode;
  noun?: string;
  page?: number;
  onPage?: (page: number) => void;
  pageSize?: number;
}) {
  const [ownPage, setOwnPage] = useState(1);
  const page = pageProp ?? ownPage;
  const onPage = onPageProp ?? setOwnPage;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount);
  const shown = rows.slice((current - 1) * pageSize, current * pageSize);

  return (
    <>
      <DataTable rows={shown} columns={columns} rowKey={rowKey} empty={empty} />
      <TableFooter page={current} pageSize={pageSize} total={rows.length} noun={noun} onPage={onPage} />
    </>
  );
}

/** The search box at the left of a Safety table toolbar. */
export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative block w-full sm:w-[200px]">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#9ca3af]" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-[38px] w-full rounded-[8px] border border-[#d1d5db] bg-white pr-3 pl-[41px] text-sm text-[#111827] placeholder:text-[#6b7280] focus:border-[#2563eb] focus:outline-none"
      />
    </label>
  );
}

/** A table card's top bar: search, filters and an action. */
export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[#f3f4f6] px-4 py-4 sm:gap-[14px]">{children}</div>
  );
}

/** Label/value pairs in a grid, for record details. */
export function DetailGrid({ items, columns = 3 }: { items: { label: string; value: ReactNode }[]; columns?: 2 | 3 | 4 }) {
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[columns];
  return (
    <dl className={cn("grid gap-x-6 gap-y-4", grid)}>
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1">
          <dt className="text-[11px] font-semibold tracking-[0.4px] text-[#64748b] uppercase">{item.label}</dt>
          <dd className="text-[13px] font-medium text-[#111827]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A coloured notice line inside a page. */
export function Notice({ tone, children }: { tone: "info" | "success" | "warning" | "danger"; children: ReactNode }) {
  const classes = {
    info: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
    success: "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]",
    warning: "border-[#fde68a] bg-[#fffbeb] text-[#92400e]",
    danger: "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]",
  }[tone];
  return <div className={cn("rounded-[10px] border px-4 py-3 text-[13px] font-medium", classes)}>{children}</div>;
}

/** "List | Matrix" switch between the two views of worker accreditations. */
export function AccreditationViewSwitch({ active, management }: { active: "list" | "matrix"; management?: boolean }) {
  const base = "rounded-[6px] px-4 py-2 text-[13px] font-semibold";
  // The management dashboard has the same two views (decision AD44).
  const listTo = management ? "/management/accreditations" : "/safety/accreditations";
  const matrixTo = management ? "/management/matrix" : "/safety/accreditation-matrix";
  return (
    <div className="flex w-fit gap-1 rounded-[8px] border border-[#e5e7eb] bg-white p-1">
      <Link to={listTo} className={cn(base, active === "list" ? "bg-[#eff6ff] text-[#2563eb]" : "text-[#64748b] hover:text-[#111827]")}>
        List
      </Link>
      <Link to={matrixTo} className={cn(base, active === "matrix" ? "bg-[#eff6ff] text-[#2563eb]" : "text-[#64748b] hover:text-[#111827]")}>
        Matrix
      </Link>
    </div>
  );
}

/** "Reminders 30, 14 and 7 days before review, then weekly once overdue." (framework 7 defaults) */
export function reminderText(days: number[], before: string): string {
  const list = days.length <= 1 ? String(days[0] ?? "") : `${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}`;
  return `${list} days before ${before}, then weekly once overdue`;
}
