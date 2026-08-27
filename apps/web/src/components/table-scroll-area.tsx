import { cn } from "@usi-installer/ui/lib/utils";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

interface TableScrollAreaProps {
  children: ReactNode;
  className?: string;
}

/**
 * Scrolls a wide table sideways from a rail pinned to the top of its card.
 *
 * Left where the browser puts it, the horizontal scrollbar sits under the last
 * row — twenty-five tall rows down, well off-screen. Reaching the control that
 * scrolls the table sideways meant first scrolling the page to the bottom.
 *
 * So the bar is lifted out and made sticky: an empty strip as wide as the
 * table, mirroring the body's `scrollLeft` in both directions, riding at the
 * top of the viewport for as long as the card is on screen. It is a real
 * scroll container rather than a drawn imitation, so native drag, click-track,
 * shift-wheel and keyboard behaviour all still work.
 *
 * The body keeps its own horizontal scrolling — that is what the rail mirrors —
 * but its scrollbar is hidden, so there is exactly one visible control.
 */
export function TableScrollArea({ children, className }: TableScrollAreaProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Assigning `scrollLeft` fires the other element's scroll event, which would
  // assign back. One frame of suppression breaks the loop.
  const isMirroring = useRef(false);

  const [{ scrollWidth, clientWidth }, setMetrics] = useState({ scrollWidth: 0, clientWidth: 0 });

  useEffect(() => {
    const body = bodyRef.current;
    if (body === null) return;

    const measure = () =>
      setMetrics((previous) =>
        previous.scrollWidth === body.scrollWidth && previous.clientWidth === body.clientWidth
          ? previous
          : { scrollWidth: body.scrollWidth, clientWidth: body.clientWidth },
      );

    measure();

    // The viewport drives `clientWidth`; the table drives `scrollWidth`, and it
    // changes on its own whenever rows re-wrap or a column is added.
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    const table = body.querySelector("table");
    if (table !== null) observer.observe(table);

    return () => observer.disconnect();
  }, []);

  const mirror = useCallback((from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (from === null || to === null || isMirroring.current) return;

    isMirroring.current = true;
    to.scrollLeft = from.scrollLeft;
    requestAnimationFrame(() => {
      isMirroring.current = false;
    });
  }, []);

  // A rail over a table that fits would be a scrollbar that does nothing.
  const overflows = scrollWidth > clientWidth + 1;

  return (
    <div className={cn("flex flex-col", className)}>
      <div
        ref={railRef}
        onScroll={() => mirror(railRef.current, bodyRef.current)}
        aria-hidden
        className={cn(
          "sticky top-0 z-20 overflow-x-auto overflow-y-hidden border-b border-slate-200 bg-white py-1",
          !overflows && "hidden",
        )}
      >
        <div style={{ width: scrollWidth }} className="h-px" />
      </div>

      <div
        ref={bodyRef}
        onScroll={() => mirror(bodyRef.current, railRef.current)}
        // Scrolls, but shows no bar of its own — the rail above is the control.
        className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </div>
  );
}
