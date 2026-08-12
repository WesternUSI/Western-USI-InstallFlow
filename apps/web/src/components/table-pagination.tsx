import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@usi-installer/ui/components/pagination";

interface TablePaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

/** Page numbers with an ellipsis before the last page, as in the design. */
function pageNumbers(page: number, pageCount: number): (number | "ellipsis")[] {
  if (pageCount <= 5) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const window = [page - 1, page, page + 1].filter((n) => n > 1 && n < pageCount);
  const items: (number | "ellipsis")[] = [1, ...window];

  if (page + 1 < pageCount - 1) items.push("ellipsis");
  items.push(pageCount);

  return items;
}

/** "Showing 1 to 25 of 608 rows" plus the pager, shared by both review tables. */
export function TablePagination({ total, page, pageSize, onPageChange }: TablePaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
      <p className="text-sm text-slate-500">
        Showing {firstRow} to {lastRow} of {total.toLocaleString()} rows
      </p>
      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              text=""
              aria-disabled={page === 1}
              className={page === 1 ? "pointer-events-none opacity-40" : undefined}
              onClick={(event) => {
                event.preventDefault();
                onPageChange(page - 1);
              }}
            />
          </PaginationItem>
          {pageNumbers(page, pageCount).map((item, index) =>
            item === "ellipsis" ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: an ellipsis has no stable id
              <PaginationItem key={`ellipsis-${index}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={item}>
                <PaginationLink
                  href="#"
                  isActive={item === page}
                  className="text-sm"
                  onClick={(event) => {
                    event.preventDefault();
                    onPageChange(item);
                  }}
                >
                  {item}
                </PaginationLink>
              </PaginationItem>
            ),
          )}
          <PaginationItem>
            <PaginationNext
              href="#"
              text=""
              aria-disabled={page === pageCount}
              className={page === pageCount ? "pointer-events-none opacity-40" : undefined}
              onClick={(event) => {
                event.preventDefault();
                onPageChange(page + 1);
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
