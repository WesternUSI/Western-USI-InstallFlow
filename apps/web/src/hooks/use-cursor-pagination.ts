import { useCallback, useState } from "react";

/**
 * Drives a Convex cursor-paginated query.
 *
 * Convex cursors only move forward, so the cursor that opened each visited page
 * is kept in a stack. That supports Next and Previous and a running page
 * number, but not jumping straight to an arbitrary page — there is no cursor
 * for a page nobody has walked to yet.
 *
 * `filterKey` must describe every argument the query is filtered by. A cursor
 * belongs to one exact query, and Convex rejects it with `InvalidCursor` the
 * moment those arguments change, so the stack is dropped during render as soon
 * as the key differs — waiting for an effect would let one stale render through
 * and throw.
 */
export function useCursorPagination(pageSize: number, filterKey: string) {
  const [state, setState] = useState({ filterKey, cursors: [null as string | null], index: 0 });

  if (state.filterKey !== filterKey) {
    setState({ filterKey, cursors: [null], index: 0 });
  }

  // Read from the incoming key, not from state, so the render that notices the
  // change already sends the reset cursor rather than the previous query's.
  const isStale = state.filterKey !== filterKey;
  const index = isStale ? 0 : state.index;
  const cursor = isStale ? null : (state.cursors[index] ?? null);

  const next = useCallback((continueCursor: string | null) => {
    setState((previous) => {
      const nextIndex = previous.index + 1;
      const cursors = previous.cursors.slice(0, nextIndex);
      cursors.push(continueCursor);
      return { ...previous, cursors, index: nextIndex };
    });
  }, []);

  const previous = useCallback(() => {
    setState((current) => ({ ...current, index: Math.max(0, current.index - 1) }));
  }, []);

  return {
    paginationOpts: { numItems: pageSize, cursor },
    page: index + 1,
    hasPrevious: index > 0,
    next,
    previous,
  };
}
