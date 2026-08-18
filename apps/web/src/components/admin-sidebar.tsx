import { api } from "@usi-installer/backend/convex/_generated/api";
import { Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@usi-installer/ui/components/avatar";
import { cn } from "@usi-installer/ui/lib/utils";
import { useQuery } from "convex/react";
import {
  ChevronRight,
  ClipboardList,
  Database,
  FileSpreadsheet,
  LayoutDashboard,
  Settings,
  UploadCloud,
  UserCog,
  Users,
  X,
} from "lucide-react";

import logo from "@/assets/western-usi-logo.png";
import { useSidebar } from "@/lib/sidebar-context";

const NAV_GROUPS = [
  {
    label: null,
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Work Orders",
    items: [
      { to: "/import-work-orders", label: "Import Work Orders", icon: UploadCloud },
      { to: "/manage-orders", label: "Manage Orders", icon: ClipboardList },
    ],
  },
  {
    label: "Site Database",
    items: [
      { to: "/import-site-data", label: "Import Site Data", icon: FileSpreadsheet },
      { to: "/manage-site-data", label: "Manage Site Data", icon: Database },
    ],
  },
  {
    label: "Teams & Users",
    items: [
      { to: "/teams", label: "Teams", icon: Users },
      { to: "/users", label: "Users", icon: UserCog },
    ],
  },
  {
    label: "System",
    items: [{ to: "/settings", label: "Settings", icon: Settings }],
  },
] as const;

/** Display names for the roles defined on the users table. */
const ROLE_LABELS = {
  admin: "Administrator",
  office_staff: "Office Staff",
  installer: "Installer",
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

      <nav className="flex-1 overflow-y-auto py-4">
        {NAV_GROUPS.map((group, index) => (
          <div key={group.label ?? "root"} className={cn("flex flex-col gap-2", index > 0 && "mt-6")}>
            {group.label && (
              <p className="px-7 text-[11px] font-bold tracking-[0.55px] text-[#6B7280] uppercase">
                {group.label}
              </p>
            )}
            <ul className="flex flex-col gap-1 px-4">
              {group.items.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={close}
                    className="flex h-9 items-center gap-3 rounded-md px-3 text-sm text-[#D1D5DB] transition-colors hover:bg-white/5 hover:text-white"
                    activeProps={{ className: "bg-[#2563EB] text-white hover:bg-[#2563EB]" }}
                  >
                    <item.icon className="size-5 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-[#1F2937] p-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-10 bg-[#1E3A8A]">
            {user?.image_url && <AvatarImage src={user.image_url} alt={user.name} />}
            <AvatarFallback className="bg-[#1E3A8A] text-base font-bold text-white">
              {initials(user?.name ?? "User")}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="truncate text-sm font-bold text-white">{user?.name ?? " "}</p>
            <p className="truncate text-xs text-[#DDDDDD] capitalize">
              {user?.role === undefined ? "" : ROLE_LABELS[user.role]}
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-[#9CA3AF]" />
        </div>
      </div>
      </aside>
    </>
  );
}
