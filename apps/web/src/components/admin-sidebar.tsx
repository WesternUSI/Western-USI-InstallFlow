import { useClerk } from "@clerk/react";
import { api } from "@usi-installer/backend/convex/_generated/api";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@usi-installer/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@usi-installer/ui/components/dropdown-menu";
import { cn } from "@usi-installer/ui/lib/utils";
import { useQuery } from "convex/react";
import { ChevronDown, ChevronRight, LogOut, Mail, X } from "lucide-react";
import { useState } from "react";

import homeIcon from "@/assets/nav/home.svg";
import safetyIcon from "@/assets/nav/safety.png";
import siteDatabaseIcon from "@/assets/nav/site-database.svg";
import teamsUsersIcon from "@/assets/nav/teams-users.svg";
import workOrdersIcon from "@/assets/nav/work-orders.png";
import logo from "@/assets/western-usi-logo.png";
import { DashboardSwitch } from "@/components/dashboard-switch";
import { hasBothDashboards } from "@/lib/dashboard-mode";
import { useSidebar } from "@/lib/sidebar-context";

interface NavLink {
  to: string;
  label: string;
}

/**
 * The navigation, as in the Figma "Safety / Admin navigation": top-level
 * links, and groups that expand to show their pages. A group opens by itself
 * when the current page is inside it.
 */
const NAV: (
  | { kind: "link"; to: string; label: string; icon: string }
  | { kind: "group"; label: string; icon: string; items: NavLink[] }
)[] = [
  { kind: "link", to: "/dashboard", label: "Dashboard", icon: homeIcon },
  {
    kind: "group",
    label: "Work Orders",
    icon: workOrdersIcon,
    items: [
      { to: "/import-work-orders", label: "Import Work Orders" },
      { to: "/scheduled-imports", label: "Scheduled Imports" },
      { to: "/manage-orders", label: "Manage Orders" },
    ],
  },
  {
    kind: "group",
    label: "Site Database",
    icon: siteDatabaseIcon,
    items: [
      { to: "/import-site-data", label: "Import Site Data" },
      { to: "/manage-site-data", label: "Manage Site Data" },
    ],
  },
  {
    kind: "group",
    label: "Teams & Users",
    icon: teamsUsersIcon,
    items: [
      { to: "/teams", label: "Teams" },
      { to: "/users", label: "Users" },
    ],
  },
  {
    kind: "group",
    label: "Safety",
    icon: safetyIcon,
    items: [
      { to: "/safety", label: "Safety Dashboard" },
      { to: "/safety/register", label: "Compliance Register" },
      { to: "/safety/documents", label: "Safety Documents" },
      { to: "/safety/accreditations", label: "Worker Accreditations" },
      { to: "/safety/insurance", label: "Insurance Register" },
      { to: "/safety/subcontractors", label: "Entities" },
      { to: "/safety/vehicles", label: "Vehicle Register" },
      { to: "/safety/kits", label: "First-Aid Kits" },
      { to: "/safety/equipment", label: "Height & Safety Equipment" },
      { to: "/safety/medical-centres", label: "Medical Centres" },
      { to: "/safety/reports", label: "Reports & Exports" },
      // Roles & Permissions is hidden for now (decision AD28); the page is kept at /safety/roles.
    ],
  },
];

/** True when `pathname` is `to` or a page under it ("/safety" matches only itself). */
function isActive(pathname: string, to: string): boolean {
  if (to === "/safety") return pathname === "/safety" || pathname === "/safety/";
  // The matrix and the types list belong to Worker Accreditations.
  if (to === "/safety/accreditations" && (pathname === "/safety/accreditation-matrix" || pathname === "/safety/accreditation-types")) return true;
  return pathname === to || pathname.startsWith(`${to}/`);
}

function NavIcon({ src }: { src: string }) {
  return <img src={src} alt="" className="size-5 shrink-0 object-contain" />;
}

const topLinkClass =
  "flex items-center gap-3 rounded-[12px] px-3.5 py-2.5 text-sm font-medium text-[#D1D5DB] transition-colors hover:bg-white/5 hover:text-white";

/** Display names for the roles defined on the users table. */
const ROLE_LABELS = {
  admin: "Administrator",
  installer: "Installer",
  subcontractor: "Subcontractor",
  management: "Management",
} as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function AdminSidebar() {
  const user = useQuery(api.users.currentUser);
  const { open, close } = useSidebar();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isAdmin = user?.role === "admin" || user?.has_admin_access === true;

  async function handleSignOut() {
    await signOut();
    void navigate({ to: "/login" });
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col bg-[#0F172A] text-slate-300 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
      <div className="flex h-20 shrink-0 items-center justify-between border-b border-[#1F2937] px-6">
        <div className="flex flex-col gap-1">
          {/* The source logo is black-on-transparent, made for a light
              background; inverted to read white on the dark sidebar. */}
          <img src={logo} alt="Western USI" className="h-5 w-auto brightness-0 invert" />
          <p className="text-[10px] tracking-[1px] text-[#9CA3AF]">ADMIN PANEL</p>
        </div>
        <button
          type="button"
          aria-label="Close menu"
          onClick={close}
          className="rounded-md p-1.5 text-[#9CA3AF] hover:bg-white/5 hover:text-white lg:hidden"
        >
          <X className="size-5" />
        </button>
      </div>

      <DashboardSwitch current="admin" onSwitch={close} />

      <nav className="flex-1 overflow-y-auto px-5 pt-6 pb-4">
        <ul className="flex flex-col gap-1">
          {NAV.map((entry) =>
            entry.kind === "link" ? (
              <li key={entry.to}>
                <Link
                  to={entry.to}
                  onClick={close}
                  className={topLinkClass}
                  activeProps={{ className: "font-semibold text-white" }}
                >
                  <NavIcon src={entry.icon} />
                  {entry.label}
                </Link>
              </li>
            ) : (
              <NavGroup
                key={entry.label}
                label={entry.label}
                icon={entry.icon}
                items={entry.items}
                pathname={pathname}
                onNavigate={close}
              />
            ),
          )}
          {isAdmin && (
            // Hidden from non-admins, matching the mutations behind it. A UX gate
            // only — `emails.*` re-checks the role server-side. See design.md §3.3.
            <li>
              <Link
                to="/emails"
                onClick={close}
                className={topLinkClass}
                activeProps={{ className: "font-semibold text-white" }}
              >
                <Mail className="size-5 shrink-0" />
                Emails
              </Link>
            </li>
          )}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-[#1F2937] p-4">
        <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-md p-1 text-left transition-colors hover:bg-white/5">
          <Avatar className="size-10 bg-[#1E3A8A]">
            {user?.image_url && <AvatarImage src={user.image_url} alt={user.name} />}
            <AvatarFallback className="bg-[#1E3A8A] text-base font-bold text-white">
              {initials(user?.name ?? "User")}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="truncate text-sm font-bold text-white">{user?.name ?? " "}</p>
            <p className="truncate text-xs text-[#DDDDDD] capitalize">
              {user?.role === undefined
                ? ""
                : hasBothDashboards(user)
                  ? "Administrator · Management"
                  : ROLE_LABELS[user.has_admin_access ? "admin" : user.role]}
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-[#9CA3AF]" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="min-w-48">
          <DropdownMenuItem
            onClick={() => void handleSignOut()}
            className="gap-2 text-red-600 focus:text-red-600"
          >
            <LogOut className="size-4" />
            Log Out
          </DropdownMenuItem>
        </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </aside>
    </>
  );
}

/** A heading that expands to its pages. Opens by itself while one of its pages is showing. */
function NavGroup({
  label,
  icon,
  items,
  pathname,
  onNavigate,
}: {
  label: string;
  icon: string;
  items: NavLink[];
  pathname: string;
  onNavigate: () => void;
}) {
  const containsActive = items.some((item) => isActive(pathname, item.to));
  const [expanded, setExpanded] = useState(containsActive);
  const showItems = expanded || containsActive;

  return (
    <li className="pt-1">
      <button
        type="button"
        aria-expanded={showItems}
        onClick={() => setExpanded((current) => !(current || containsActive))}
        className="flex w-full items-center justify-between rounded-[12px] px-3.5 py-2.5 text-sm font-medium text-[#D1D5DB] transition-colors hover:bg-white/5 hover:text-white"
      >
        <span className="flex items-center gap-3">
          <NavIcon src={icon} />
          {label}
        </span>
        {showItems ? (
          <ChevronDown className="size-4 shrink-0 text-[#9CA3AF]" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-[#9CA3AF]" />
        )}
      </button>
      {showItems && (
        <ul className="flex flex-col">
          {items.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                onClick={onNavigate}
                className={cn(
                  "flex h-8 items-center rounded-[6px] pl-8 text-[13px] font-semibold text-[#D1D5DB] transition-colors hover:bg-white/5 hover:text-white",
                  isActive(pathname, item.to) && "bg-[#2563EB] text-white hover:bg-[#2563EB]",
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
