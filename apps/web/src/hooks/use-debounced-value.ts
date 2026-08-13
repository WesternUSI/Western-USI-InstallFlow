import { useEffect, useRef, useState } from "react";

/**
 * Trails `value` by `delay`, so a query keyed on it runs once the user stops
 * typing rather than on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * Holds on to the last loaded result while a new one is in flight.
 *
 * A Convex `useQuery` goes back to `undefined` whenever its arguments change,
 * which would drop the table back to a skeleton on every search change. Keeping
 * the previous page on screen makes typing feel continuous.
 */
export function useStickyValue<T>(value: T | undefined): T | undefined {
  const lastLoaded = useRef<T | undefined>(undefined);

  if (value !== undefined) {
    lastLoaded.current = value;
  }

  return value ?? lastLoaded.current;
}
