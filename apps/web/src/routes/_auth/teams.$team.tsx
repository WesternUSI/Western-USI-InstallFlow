import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@usi-installer/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@usi-installer/ui/components/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@usi-installer/ui/components/table";
import { Tabs, TabsList, TabsTrigger } from "@usi-installer/ui/components/tabs";
import { useMutation, useQuery } from "convex/react";
import {
  CheckCircle2,
  ChevronLeft,
  Clock,
  Plus,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AddMembersDialog } from "@/components/add-members-dialog";
import { PageHeader } from "@/components/page-header";
import { StatTiles } from "@/components/stat-tiles";
import { TablePagination } from "@/components/table-pagination";
import { useCursorPagination } from "@/hooks/use-cursor-pagination";
import { useStickyValue } from "@/hooks/use-debounced-value";
import { TEAMS, type Team, teamFromSlug } from "@/lib/teams";
import {
  WORK_ORDER_STATUS_CLASSES,
  WORK_ORDER_STATUS_LABELS,
  formatTrainLine,
} from "@/lib/workOrderStatus";

export const Route = createFileRoute("/_auth/teams/$team")({
  component: TeamDetailPage,
});

const PAGE_SIZE = 25;

type TabValue = "completed" | "allocated" | "pending" | "members";

const TABS: { value: TabValue; label: string }[] = [
  { value: "completed", label: "Completed Sites" },
  { value: "allocated", label: "Allocated Orders" },
  { value: "pending", label: "Pending Orders" },
  { value: "members", label: "Team Members" },
];

/** Widths add up to 100% so the table never overflows its card. */
const ORDER_COLUMNS = [
  { label: "Status", width: "w-[13%]", padding: "px-6" },
  { label: "Location", width: "w-[22%]", padding: "px-4" },
  { label: "Panel ID", width: "w-[12%]", padding: "px-4" },
  { label: "Advertiser", width: "w-[19%]", padding: "px-4" },
  { label: "Existing Advertiser", width: "w-[19%]", padding: "px-4" },
  { label: "Train Line", width: "w-[15%]", padding: "px-4" },
] as const;

const MEMBER_COLUMNS = [
  { label: "Member Name", width: "w-[30%]", padding: "px-6" },
  { label: "Email Address", width: "w-[42%]", padding: "px-4" },
  { label: "Actions", width: "w-[28%]", padding: "px-4" },
] as const;

/** One page of the team's work orders, for the three order tabs. */
function OrderTab({ team, status }: { team: Team; status: "completed" | "allocated" | "pending" }) {
  const { paginationOpts, page, hasPrevious, next, previous } = useCursorPagination(
    PAGE_SIZE,
    `${team}|${status}`,
  );

  // Keeps the current page on screen while the next one loads instead of
  // dropping back to "Loading…".
  const result = useStickyValue(
    useQuery(api.teams.orders, { team, status, paginationOpts }),
  );

  return (
    <>
      <Table className="min-w-[880px] table-fixed">
        <TableHeader>
          <TableRow className="border-slate-200 bg-gray-50 hover:bg-gray-50">
            {ORDER_COLUMNS.map((column) => (
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
          {result === undefined && (
            <TableRow>
              <TableCell colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400">
                Loading…
              </TableCell>
            </TableRow>
          )}
          {result?.page.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400">
                Nothing here for {team} yet.
              </TableCell>
            </TableRow>
          )}
          {result?.page.map((row) => (
            <TableRow key={row._id} className="border-slate-100">
              <TableCell className="px-6 py-4">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${WORK_ORDER_STATUS_CLASSES[row.status]}`}
                >
                  {WORK_ORDER_STATUS_LABELS[row.status]}
                </span>
              </TableCell>
              <TableCell className="truncate px-4 py-4 text-sm text-slate-700">{row.site}</TableCell>
              <TableCell className="truncate px-4 py-4 text-sm font-medium text-slate-700">
                {row.panel_split}
              </TableCell>
              <TableCell className="truncate px-4 py-4 text-sm text-slate-700">
                {row.advertiser_campaign}
              </TableCell>
              <TableCell className="truncate px-4 py-4 text-sm text-slate-500">
                {row.existing_advertiser ?? "—"}
              </TableCell>
              <TableCell className="truncate px-4 py-4 text-sm text-slate-500">
                {formatTrainLine(row.train_line)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <TablePagination
        shown={result?.page.length ?? 0}
        total={result?.total ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        hasPrevious={hasPrevious}
        hasNext={result !== undefined && !result.isDone}
        onPrevious={previous}
        onNext={() => result !== undefined && next(result.continueCursor)}
      />
    </>
  );
}

function TeamDetailPage() {
  const { team: slug } = Route.useParams();
  const team = teamFromSlug(slug);

  const [tab, setTab] = useState<TabValue>("completed");
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const overview = useQuery(api.teams.overview);
  const allMembers = useQuery(api.teams.allMembers);
  const setMemberTeam = useMutation(api.teams.setMemberTeam);
  const removeMember = useMutation(api.teams.removeMember);

  const stats = useMemo(
    () => overview?.rows.find((row) => row.team === team),
    [overview, team],
  );
  const members = useMemo(
    () => (allMembers ?? []).filter((member) => member.team === team),
    [allMembers, team],
  );

  if (team === undefined) {
    return (
      <>
        <PageHeader title="Team not found" description="That team does not exist." />
        <p className="py-16 text-center text-sm text-slate-400">
          <Link to="/teams" className="text-blue-600 hover:text-blue-700">
            Back to Teams Management
          </Link>
        </p>
      </>
    );
  }

  async function moveTo(userId: Id<"users">, target: Team) {
    try {
      await setMemberTeam({ user_id: userId, team: target });
      toast.success(`Moved to ${target}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reassign that member");
    }
  }

  async function remove(userId: Id<"users">, name: string) {
    try {
      await removeMember({ user_id: userId });
      toast.success(`${name} removed from ${team}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove that member");
    }
  }

  async function addMembers(ids: Id<"users">[]) {
    try {
      for (const id of ids) {
        await setMemberTeam({ user_id: id, team: team as Team });
      }
      toast.success(ids.length === 1 ? "Member added" : `${ids.length} members added`);
      setIsPickerOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add those members");
    }
  }

  return (
    <>
      <PageHeader
        title={`${team} Details`}
        description="View team performance, completed orders and manage team members."
      />

      <div className="flex flex-col gap-4 px-4 py-6">
        <Link
          to="/teams"
          className="flex w-fit items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          <ChevronLeft className="size-4" />
          Back to Teams Management
        </Link>

        <StatTiles
          tiles={[
            {
              icon: Users,
              tone: "blue",
              label: "Team Members",
              value: stats?.members,
              description: "Total team members",
            },
            {
              icon: UserCog,
              tone: "orange",
              label: "Allocated Orders",
              value: stats?.allocated,
              description: "Total allocated orders",
            },
            {
              icon: CheckCircle2,
              tone: "green",
              label: "Completed Orders",
              value: stats?.completed,
              description: "Total completed orders",
            },
            {
              icon: Clock,
              tone: "red",
              label: "Pending Orders",
              value: stats?.pending,
              description: "Total pending orders",
            },
          ]}
        />

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as TabValue)}
            className="gap-0 overflow-x-auto overflow-y-hidden"
          >
            <TabsList
              variant="line"
              className="h-auto w-full gap-10 border-b border-gray-200 bg-gray-50/50 px-6 pt-4 pb-0"
            >
              {TABS.map((entry) => (
                <TabsTrigger
                  key={entry.value}
                  value={entry.value}
                  className="px-1 pb-4 text-sm font-medium data-active:text-blue-600 data-active:after:bg-blue-500"
                >
                  {entry.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {tab === "members" ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-bold text-gray-900">Team Members</h2>
                  <p className="text-sm text-slate-500">Manage and update team members.</p>
                </div>
                <Button
                  className="h-11 gap-1.5 rounded-lg px-5 text-base"
                  onClick={() => setIsPickerOpen(true)}
                >
                  <Plus className="size-5" />
                  Add Member
                </Button>
              </div>

              <Table className="min-w-[520px] table-fixed">
                <TableHeader>
                  <TableRow className="border-slate-200 bg-gray-50 hover:bg-gray-50">
                    {MEMBER_COLUMNS.map((column) => (
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
                  {allMembers === undefined && (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="px-6 py-10 text-center text-sm text-slate-400"
                      >
                        Loading…
                      </TableCell>
                    </TableRow>
                  )}
                  {allMembers !== undefined && members.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="px-6 py-10 text-center text-sm text-slate-400"
                      >
                        No members in {team} yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {members.map((member) => (
                    <TableRow key={member._id} className="border-slate-100">
                      <TableCell className="truncate px-6 py-4 text-sm text-slate-700">
                        {member.name}
                      </TableCell>
                      <TableCell className="truncate px-4 py-4 text-sm text-slate-500">
                        {member.email}
                      </TableCell>
                      <TableCell className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-medium whitespace-nowrap text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50">
                              <UserCog className="size-3.5" />
                              Reassign
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-40">
                              {TEAMS.filter((option) => option !== team).map((option) => (
                                <DropdownMenuItem
                                  key={option}
                                  onClick={() => void moveTo(member._id, option)}
                                >
                                  Move to {option}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <button
                            type="button"
                            onClick={() => void remove(member._id, member.name)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-sm font-medium whitespace-nowrap text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
                          >
                            <Trash2 className="size-3.5" />
                            Remove
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <TablePagination
                shown={members.length}
                total={members.length}
                page={1}
                pageSize={Math.max(members.length, 1)}
                hasPrevious={false}
                hasNext={false}
                onPrevious={() => {}}
                onNext={() => {}}
              />
            </>
          ) : (
            <OrderTab team={team} status={tab} />
          )}
        </section>
      </div>

      <AddMembersDialog
        open={isPickerOpen}
        team={team}
        members={allMembers}
        onOpenChange={setIsPickerOpen}
        onAdd={(ids) => void addMembers(ids)}
      />
    </>
  );
}
