import { Button } from "@usi-installer/ui/components/button";
import { ListFilter } from "lucide-react";

import { type SearchOption, SearchInput } from "@/components/search-input";

interface TableToolbarProps {
  title: string;
  search: string;
  placeholder: string;
  searchOptions: SearchOption[] | undefined;
  onSearchChange: (search: string) => void;
}

/** Card heading with the search box and Filters button, shared by both review tables. */
export function TableToolbar({
  title,
  search,
  placeholder,
  searchOptions,
  onSearchChange,
}: TableToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      <div className="flex items-center gap-3">
        <SearchInput
          value={search}
          placeholder={placeholder}
          options={searchOptions}
          onChange={onSearchChange}
          className="w-80"
        />
        <Button variant="outline" className="h-[38px] gap-2 rounded-lg">
          <ListFilter className="size-4" />
          Filters
        </Button>
      </div>
    </div>
  );
}
