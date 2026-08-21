import type { ReactNode } from "react";

import { type SearchOption, SearchInput } from "@/components/search-input";

interface TableToolbarProps {
  title: string;
  search: string;
  placeholder: string;
  searchOptions: SearchOption[] | undefined;
  /** Control shown beside the search box. Omitted on the import previews. */
  action?: ReactNode;
  onSearchChange: (search: string) => void;
}

/** Card heading with the search box, shared by both table cards. */
export function TableToolbar({
  title,
  search,
  placeholder,
  searchOptions,
  action,
  onSearchChange,
}: TableToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
        <SearchInput
          value={search}
          placeholder={placeholder}
          options={searchOptions}
          onChange={onSearchChange}
          className="w-full sm:w-80"
        />
        {action}
      </div>
    </div>
  );
}
