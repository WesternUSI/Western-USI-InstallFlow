import { Skeleton } from "@usi-installer/ui/components/skeleton";

/** Keeps the Manage Orders layout stable while the first page loads. */
export function WorkOrderTableSkeleton() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <Skeleton className="h-4 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>
      <div className="flex gap-4 border-b border-slate-200 px-5 pb-2.5">
        {[80, 90, 100, 90, 100].map((width) => (
          <Skeleton key={width} className="h-3" style={{ width }} />
        ))}
      </div>
      <div className="flex flex-col gap-4 px-5 py-5">
        {[0, 1, 2, 3, 4].map((row) => (
          <Skeleton key={row} className="h-4 w-full" />
        ))}
      </div>
    </section>
  );
}
