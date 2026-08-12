import { Button } from "@usi-installer/ui/components/button";
import { Input } from "@usi-installer/ui/components/input";
import { ListFilter, Search } from "lucide-react";

interface TableToolbarProps {
  title: string;
  search: string;
  placeholder: string;
  onSearchChange: (search: string) => void;
}

/** Card heading with the search box and Filters button, shared by both review tables. */
export function TableToolbar({ title, search, placeholder, onSearchChange }: TableToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={placeholder}
            className="h-[38px] w-80 rounded-lg pl-10 text-sm"
          />
        </div>
        <Button variant="outline" className="h-[38px] gap-2 rounded-lg">
          <ListFilter className="size-4" />
          Filters
        </Button>
      </div>
    </div>
  );
}
