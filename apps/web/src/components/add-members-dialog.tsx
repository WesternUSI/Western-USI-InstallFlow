import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { Button } from "@usi-installer/ui/components/button";
import { Checkbox } from "@usi-installer/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@usi-installer/ui/components/dialog";
import { Input } from "@usi-installer/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usi-installer/ui/components/table";
import { Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { FilterSelect } from "@/components/filter-select";
import { TEAMS, type Team } from "@/lib/teams";

export interface MemberOption {
  _id: Id<"users">;
  name: string;
  email: string;
  team?: string;
}

interface AddMembersDialogProps {
  open: boolean;
  /** The team members are being added to. Its current members are hidden. */
  team: Team;
  members: MemberOption[] | undefined;
  onOpenChange: (open: boolean) => void;
  onAdd: (ids: Id<"users">[]) => void;
}

const ALL_TEAMS = "__all__";
const NO_TEAM = "__none__";

/** Widths add up to 100% so the table never overflows the dialog. */
const COLUMNS = [
  { label: "", width: "w-[8%]", padding: "px-4" },
  { label: "Member Name", width: "w-[32%]", padding: "px-2" },
  { label: "Email Address", width: "w-[40%]", padding: "px-4" },
  { label: "Current Team", width: "w-[20%]", padding: "px-4" },
] as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Picks existing users to move into a team. A user belongs to exactly one
 * team, so anyone chosen here leaves whichever team the "Current Team" column
 * shows — hence that column being the one shown beside the email.
 */
export function AddMembersDialog({
  open,
  team,
  members,
  onOpenChange,
  onAdd,
}: AddMembersDialogProps) {
  const [search, setSearch] = useState("");
  const [currentTeam, setCurrentTeam] = useState(ALL_TEAMS);
  const [selected, setSelected] = useState<Id<"users">[]>([]);

  // Reopening starts from a clean picker rather than the last session's choices.
  useEffect(() => {
    if (open) {
      setSearch("");
      setCurrentTeam(ALL_TEAMS);
      setSelected([]);
    }
  }, [open]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return (members ?? [])
      .filter((member) => member.team !== team)
      .filter((member) => {
        if (currentTeam === ALL_TEAMS) return true;
        if (currentTeam === NO_TEAM) return member.team === undefined;
        return member.team === currentTeam;
      })
      .filter(
        (member) =>
          needle === "" ||
          member.name.toLowerCase().includes(needle) ||
          member.email.toLowerCase().includes(needle),
      );
  }, [members, team, currentTeam, search]);

  function toggle(id: Id<"users">) {
    setSelected((current) =>
      current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id],
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 rounded-xl border-slate-200 bg-white p-0">
        <DialogHeader className="border-b border-slate-200 px-6 py-5">
          <DialogTitle className="text-lg font-bold text-slate-900">Add Members</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            Select team members to add to {team}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3 px-6 py-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              placeholder="Search by name or email…"
              onChange={(event) => setSearch(event.target.value)}
              className="h-[38px] rounded-lg pl-10 text-sm"
            />
          </div>

          <FilterSelect
            label="Current Team"
            value={currentTeam}
            options={[
              { value: ALL_TEAMS, label: "All Teams" },
              { value: NO_TEAM, label: "No Team" },
              ...TEAMS.filter((option) => option !== team).map((option) => ({
                value: option,
                label: option,
              })),
            ]}
            onChange={setCurrentTeam}
          />
        </div>

        <div className="max-h-80 overflow-y-auto border-y border-slate-200">
          <Table className="min-w-[600px] table-fixed">
            <TableHeader>
              <TableRow className="border-slate-200 bg-gray-50 hover:bg-gray-50">
                {COLUMNS.map((column) => (
                  <TableHead
                    key={column.label}
                    className={`${column.width} ${column.padding} py-3 text-[11px] font-bold tracking-[0.55px] text-slate-500 uppercase`}
                  >
                    {column.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members === undefined && (
                <TableRow>
                  <TableCell colSpan={4} className="px-6 py-10 text-center text-sm text-slate-400">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {members !== undefined && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="px-6 py-10 text-center text-sm text-slate-400">
                    No one left to add.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((member) => {
                const isSelected = selected.includes(member._id);

                return (
                  <TableRow
                    key={member._id}
                    onClick={() => toggle(member._id)}
                    className={`cursor-pointer border-slate-100 ${
                      isSelected ? "bg-blue-50 hover:bg-blue-50" : ""
                    }`}
                  >
                    <TableCell className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggle(member._id)}
                        aria-label={`Select ${member.name}`}
                      />
                    </TableCell>
                    <TableCell className="px-2 py-3">
                      <span className="flex items-center gap-2.5">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-blue-700">
                          {initials(member.name)}
                        </span>
                        <span className="truncate text-sm text-slate-700">{member.name}</span>
                      </span>
                    </TableCell>
                    <TableCell className="truncate px-4 py-3 text-sm text-slate-500">
                      {member.email}
                    </TableCell>
                    <TableCell className="truncate px-4 py-3 text-sm text-slate-500">
                      {member.team ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <p className="text-sm text-slate-500">
            {selected.length} member{selected.length === 1 ? "" : "s"} selected
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => setSelected([])}
                className="ml-3 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Clear Selection
              </button>
            )}
          </p>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="h-[38px] rounded-lg"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              className="h-[38px] gap-1.5 rounded-lg"
              disabled={selected.length === 0}
              onClick={() => onAdd(selected)}
            >
              <Plus className="size-4" />
              Add Members
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
