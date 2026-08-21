import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@usi-installer/ui/components/pagination";

export interface TablePaginationProps {
  /** Rows on the page currently shown. */
  shown: number;
  /** Total matching rows, from the counts query. */
  total: number;
  page: number;
  pageSize: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

/**
 * Row counter and pager for a cursor-paginated table.
 *
 * Convex cursors move one page at a time, so this offers Previous and Next
 * rather than the numbered jump-to-page links — there is no cursor for a page
 * that has not been walked to.
 */
export function TablePagination({
  shown,
  total,
  page,
  pageSize,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
}: TablePaginationProps) {
  const firstRow = shown === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = shown === 0 ? 0 : firstRow + shown - 1;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
      <p className="text-sm text-slate-500">
        Showing {firstRow.toLocaleString()} to {lastRow.toLocaleString()} of{" "}
        {total.toLocaleString()} rows
      </p>

      <div className="flex items-center gap-4">
        <p className="text-sm text-slate-500">
          Page {page.toLocaleString()} of {pageCount.toLocaleString()}
        </p>
        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                text=""
                aria-disabled={!hasPrevious}
                className={!hasPrevious ? "pointer-events-none opacity-40" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  onPrevious();
                }}
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href="#"
                text=""
                aria-disabled={!hasNext}
                className={!hasNext ? "pointer-events-none opacity-40" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  onNext();
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
