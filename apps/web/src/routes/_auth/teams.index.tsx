import { api } from "@usi-installer/backend/convex/_generated/api";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@usi-installer/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usi-installer/ui/components/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@usi-installer/ui/components/tooltip";
import { useQuery } from "convex/react";
import { CheckCircle2, ChevronDown, ChevronRight, Clock, LayoutGrid, Plus, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { FilterSelect } from "@/components/filter-select";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/search-input";
import { StatTiles } from "@/components/stat-tiles";
import { TablePagination } from "@/components/table-pagination";
import { type Team, teamSlug } from "@/lib/teams";

export const Route = createFileRoute("/_auth/teams/")({
  component: TeamsPage,
});

const ALL_STATUSES = "__all__";

/** Widths add up to 100% so the table never overflows its card. */
const COLUMNS = [
  { label: "Team", width: "w-[32%]", padding: "px-6" },
  { label: "Allocated", width: "w-[11%]", padding: "px-4" },
  { label: "Completed", width: "w-[11%]", padding: "px-4" },
  { label: "Pending", width: "w-[11%]", padding: "px-4" },
  { label: "Members", width: "w-[11%]", padding: "px-4" },
  { label: "Actions", width: "w-[24%]", padding: "px-4" },
] as const;

const MEMBER_COLUMNS = [
  { label: "Team Member", width: "w-[45%]" },
  { label: "Email Address", width: "w-[55%]" },
] as const;

interface Member {
  _id: string;
  name: string;
  email: string;
  team?: string;
}

/** The member list that slides open under a team row. */
function MemberRows({ members }: { members: Member[] }) {
  if (members.length === 0) {
    return <p className="px-6 py-6 text-center text-sm text-slate-400">No members in this team.</p>;
  }

  return (
    <Table className="min-w-[420px] table-fixed">
      <TableHeader>
        <TableRow className="border-slate-200 bg-white hover:bg-white">
          {MEMBER_COLUMNS.map((column) => (
            <TableHead
              key={column.label}
              className={`${column.width} px-4 py-3 text-[11px] font-bold tracking-[0.55px] text-slate-500 uppercase`}
            >
              {column.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TableRow key={member._id} className="border-slate-100">
            <TableCell className="truncate px-4 py-3 text-sm text-slate-700">
              {member.name}
            </TableCell>
            <TableCell className="truncate px-4 py-3 text-sm text-slate-500">
              {member.email}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function TeamsPage() {
  const [search, setSearch] = useState("");
  const [orderStatus, setOrderStatus] = useState(ALL_STATUSES);
  const [expanded, setExpanded] = useState<string | null>(null);

  const overview = useQuery(api.teams.overview);
  const members = useQuery(api.teams.allMembers);

  const membersByTeam = useMemo(() => {
    const grouped = new Map<string, Member[]>();
    for (const member of members ?? []) {
      if (member.team === undefined) continue;
      grouped.set(member.team, [...(grouped.get(member.team) ?? []), member]);
    }
    return grouped;
  }, [members]);

  // The Order Status filter narrows the table to teams that actually have work
  // in that state — the counts themselves are always all three.
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return (overview?.rows ?? [])
      .filter((row) => row.team.toLowerCase().includes(needle))
      .filter((row) => {
        if (orderStatus === ALL_STATUSES) return true;
        return row[orderStatus as "allocated" | "completed" | "pending"] > 0;
      });
  }, [overview, search, orderStatus]);

  return (
    <>
      <PageHeader
        title="Teams Management"
        description="Manage teams, track their performance and view completed order evidence."
      />

      <div className="flex flex-col gap-4 px-4 py-6">
        <StatTiles
          tiles={[
            {
              icon: LayoutGrid,
              tone: "blue",
              label: "Total Teams",
              value: overview?.totals.teams,
              description: "Total number of teams",
            },
            {
              icon: Users,
              tone: "orange",
              label: "Allocated Orders",
              value: overview?.totals.allocated,
              description: "Total allocated orders",
            },
            {
              icon: CheckCircle2,
              tone: "green",
              label: "Completed Orders",
              value: overview?.totals.completed,
              description: "Total completed orders",
            },
            {
              icon: Clock,
              tone: "red",
              label: "Pending Orders",
              value: overview?.totals.pending,
              description: "Total pending orders across all teams",
            },
          ]}
        />

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-3 px-6 py-4">
            <SearchInput
              value={search}
              options={[]}
              placeholder="Search by team name…"
              onChange={setSearch}
              className="w-full sm:min-w-56 sm:flex-1"
            />

            <div className="flex w-full gap-3 sm:w-auto">
              <FilterSelect
                label="Order Status"
                value={orderStatus}
                options={[
                  { value: ALL_STATUSES, label: "All" },
                  { value: "allocated", label: "Allocated" },
                  { value: "completed", label: "Completed" },
                  { value: "pending", label: "Pending" },
                ]}
                onChange={setOrderStatus}
                className="flex-1 sm:flex-none"
              />

              {/* Teams are a fixed set of five, so this cannot create one — it
                  is kept visible because the design calls for it. */}
              <Tooltip>
                <TooltipTrigger render={<span tabIndex={0} className="shrink-0" />}>
                  <Button disabled className="h-[38px] w-full gap-1.5 rounded-lg sm:w-auto">
                    <Plus className="size-4" />
                    Add Team
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Teams are fixed (Team 1–5)</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Fixed layout with explicit widths so long values truncate
              instead of stretching a column; min-width keeps columns
              readable on narrow screens, scrolling sideways instead. */}
          <Table className="min-w-[760px] table-fixed">
            <TableHeader>
              <TableRow className="border-slate-200 bg-gray-50 hover:bg-gray-50">
                {COLUMNS.map((column) => (
                  <TableHead
                    key={column.label}
                    className={`${column.width} ${column.padding} py-5 text-[11px] font-bold tracking-[0.55px] text-slate-500 uppercase`}
                  >
                    {column.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview === undefined && (
                <TableRow>
                  <TableCell colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {overview !== undefined && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400">
                    No teams match this filter.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => {
                const isOpen = expanded === row.team;

                return [
                  <TableRow key={row.team} className="border-slate-100">
                    <TableCell className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : row.team)}
                        aria-expanded={isOpen}
                        className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900"
                      >
                        {isOpen ? (
                          <ChevronDown className="size-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="size-4 text-slate-400" />
                        )}
                        {row.team}
                      </button>
                    </TableCell>
                    <TableCell className="px-4 py-4 text-sm text-slate-700">
                      {row.allocated.toLocaleString()}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-sm font-medium text-green-600">
                      {row.completed.toLocaleString()}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-sm font-medium text-red-500">
                      {row.pending.toLocaleString()}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-sm text-slate-700">
                      {row.members.toLocaleString()}
                    </TableCell>
                    <TableCell className="px-4 py-4">
                      <Link
                        to="/teams/$team"
                        params={{ team: teamSlug(row.team as Team) }}
                        className="text-sm font-medium text-blue-600 hover:text-blue-700"
                      >
                        View Details
                      </Link>
                    </TableCell>
                  </TableRow>,

                  isOpen ? (
                    <TableRow key={`${row.team}-members`} className="border-slate-100 hover:bg-transparent">
                      <TableCell colSpan={6} className="bg-gray-50 p-0">
                        <div className="mx-6 my-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
                          <MemberRows members={membersByTeam.get(row.team) ?? []} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null,
                ];
              })}
            </TableBody>
          </Table>

          <TablePagination
            shown={rows.length}
            total={rows.length}
            page={1}
            pageSize={Math.max(rows.length, 1)}
            hasPrevious={false}
            hasNext={false}
            onPrevious={() => {}}
            onNext={() => {}}
          />
        </section>
      </div>
    </>
  );
}
