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
import { useQuery } from "convex/react";
import { UserCheck, UserPlus, UserX, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { FilterSelect } from "@/components/filter-select";
import { InviteInstallerDialog } from "@/components/invite-installer-dialog";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/search-input";
import { StatTiles } from "@/components/stat-tiles";
import { TablePagination } from "@/components/table-pagination";
import { TEAMS } from "@/lib/teams";
import { USER_STATUS_CLASSES, USER_STATUS_LABELS, type UserStatus } from "@/lib/userStatus";

export const Route = createFileRoute("/_auth/users/")({
  component: UsersPage,
});

const PAGE_SIZE = 25;
const ALL_TEAMS = "__all__";
const ALL_STATUSES = "__all__";

/** Widths add up to 100% so the table never overflows its card. */
const COLUMNS = [
  { label: "User", width: "w-[26%]", padding: "px-6" },
  { label: "Username / Email", width: "w-[28%]", padding: "px-4" },
  { label: "Current Team", width: "w-[16%]", padding: "px-4" },
  { label: "Status", width: "w-[14%]", padding: "px-4" },
  { label: "Actions", width: "w-[16%]", padding: "px-4" },
] as const;

function UsersPage() {
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState(ALL_TEAMS);
  const [status, setStatus] = useState(ALL_STATUSES);
  const [page, setPage] = useState(1);
  const [inviteOpen, setInviteOpen] = useState(false);

  const overview = useQuery(api.users.overview);
  const users = useQuery(api.users.list);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return (users ?? [])
      .filter((user) => team === ALL_TEAMS || user.team === team)
      .filter((user) => status === ALL_STATUSES || user.status === status)
      .filter(
        (user) =>
          needle === "" ||
          user.name.toLowerCase().includes(needle) ||
          user.email.toLowerCase().includes(needle),
      );
  }, [users, search, team, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shownPage = Math.min(page, pageCount);
  const rows = filtered.slice((shownPage - 1) * PAGE_SIZE, shownPage * PAGE_SIZE);

  function resetPage() {
    setPage(1);
  }

  return (
    <>
      <PageHeader
        title="Users Management"
        description="Manage platform access, installer accounts and exclusive login credentials."
      />

      <div className="flex flex-col gap-4 px-4 py-6">
        <StatTiles
          tiles={[
            {
              icon: Users,
              tone: "blue",
              label: "Total Users",
              value: overview?.total,
              description: "Total number of users",
            },
            {
              icon: UserCheck,
              tone: "green",
              label: "Active Installers",
              value: overview?.activeInstallers,
              description: "Total onboarded users",
            },
            {
              icon: UserX,
              tone: "red",
              label: "Idle Users",
              value: overview?.idle,
              description: "Users not in any team",
            },
          ]}
        />

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-bold text-slate-900">Invite New Installers</h2>
              <p className="text-sm text-slate-500">
                Easily onboard new installers, assign them to a team, and share exclusive
                credentials for app access.
              </p>
            </div>
            <Button
              className="h-[38px] gap-1.5 rounded-lg"
              onClick={() => setInviteOpen(true)}
            >
              <UserPlus className="size-4" />
              Invite Installer
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-3 px-6 py-4">
            <SearchInput
              value={search}
              options={[]}
              placeholder="Search by name, email or username…"
              onChange={(value) => {
                setSearch(value);
                resetPage();
              }}
              className="min-w-56 flex-1"
            />

            <FilterSelect
              label="Current Team"
              value={team}
              options={[
                { value: ALL_TEAMS, label: "All" },
                ...TEAMS.map((option) => ({ value: option, label: option })),
              ]}
              onChange={(value) => {
                setTeam(value);
                resetPage();
              }}
            />

            <FilterSelect
              label="Status"
              value={status}
              options={[
                { value: ALL_STATUSES, label: "All" },
                ...Object.entries(USER_STATUS_LABELS).map(([value, label]) => ({ value, label })),
              ]}
              onChange={(value) => {
                setStatus(value);
                resetPage();
              }}
            />
          </div>

          {/* Fixed layout with explicit widths so long values truncate
              instead of stretching a column; min-width keeps columns
              readable on narrow screens, scrolling sideways instead. */}
          <Table className="min-w-[720px] table-fixed">
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
              {users === undefined && (
                <TableRow>
                  <TableCell colSpan={5} className="px-6 py-10 text-center text-sm text-slate-400">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {users !== undefined && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="px-6 py-10 text-center text-sm text-slate-400">
                    No users match this filter.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((user) => (
                <TableRow key={user._id} className="border-slate-100">
                  <TableCell className="truncate px-6 py-4 text-sm font-medium text-slate-700">
                    {user.name}
                  </TableCell>
                  <TableCell className="truncate px-4 py-4 text-sm text-slate-500">
                    {user.email}
                  </TableCell>
                  <TableCell className="truncate px-4 py-4 text-sm text-slate-700">
                    {user.team ?? "Unassigned"}
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${USER_STATUS_CLASSES[user.status as UserStatus]}`}
                    >
                      {USER_STATUS_LABELS[user.status as UserStatus]}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    <Link
                      to="/users/$userId"
                      params={{ userId: user._id }}
                      className="text-sm font-medium text-blue-600 hover:text-blue-700"
                    >
                      View Details
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <TablePagination
            shown={rows.length}
            total={filtered.length}
            page={shownPage}
            pageSize={PAGE_SIZE}
            hasPrevious={shownPage > 1}
            hasNext={shownPage < pageCount}
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(pageCount, current + 1))}
          />
        </section>
      </div>

      <InviteInstallerDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </>
  );
}
