import { useNavigate, useSearch } from "@tanstack/react-router";

/**
 * A list's search, filters and page, kept in the page address so going back
 * to the list (browser Back or the "‹ Back" link) lands on the same view.
 * Empty and "all" values are left out of the address. Changing a filter goes
 * back to page 1.
 */
export function useListState() {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();

  const get = (key: string, fallback = "") => {
    const value = search[key];
    return value === undefined || value === null || value === "" ? fallback : String(value);
  };

  const update = (changes: Record<string, string | undefined>) =>
    void navigate({
      to: ".",
      search: ((current: Record<string, unknown>) => {
        const next: Record<string, unknown> = { ...current };
        for (const [key, value] of Object.entries(changes)) {
          if (value === undefined || value === "" || value === "all") delete next[key];
          else next[key] = value;
        }
        return next;
      }) as never,
      replace: true,
    });

  const page = Math.max(1, Number(get("page", "1")) || 1);

  return {
    get,
    /** Sets one filter and goes back to page 1. */
    set: (key: string, value: string) => update({ [key]: value, page: undefined }),
    clear: (keys: string[]) => update(Object.fromEntries([...keys, "page"].map((key) => [key, undefined]))),
    page,
    setPage: (next: number) => update({ page: next <= 1 ? undefined : String(next) }),
  };
}
