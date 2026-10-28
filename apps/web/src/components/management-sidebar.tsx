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
import { ChevronDown, ChevronRight, LogOut, X } from "lucide-react";

import safetyIcon from "@/assets/nav/safety.png";
import logo from "@/assets/western-usi-logo.png";
import { DashboardSwitch } from "@/components/dashboard-switch";
import { hasBothDashboards } from "@/lib/dashboard-mode";
import { useSidebar } from "@/lib/sidebar-context";

/**
 * The management navigation (Figma "Safety / Management detailed navigation",
 * decision AD43): one Safety group. Reports & Exports is left out (management
 * gets no reports), and "Subcontractors" is "Entities", as on the admin side.
 */
const ITEMS = [
  { to: "/management", label: "Compliance Overview" },
  { to: "/management/exceptions", label: "Exceptions" },
  { to: "/management/entities", label: "Entities" },
  { to: "/management/accreditations", label: "Worker Accreditations" },
  { to: "/management/documents", label: "Safety Documents" },
];

/** Which item a page belongs to, so record pages keep their section highlighted. */
function activeItem(pathname: string): string {
  if (pathname.startsWith("/management/entities")) return "/management/entities";
  if (pathname.startsWith("/management/documents")) return "/management/documents";
  if (pathname === "/management/accreditations" || pathname === "/management/accreditations/" || pathname.startsWith("/management/matrix") || pathname.startsWith("/management/workers")) {
    return "/management/accreditations";
  }
  if (pathname === "/management" || pathname === "/management/") return "/management";
  return "/management/exceptions";
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function ManagementSidebar() {
  const user = useQuery(api.users.currentUser);
  const { open, close } = useSidebar();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = activeItem(pathname);

  async function handleSignOut() {
    await signOut();
    void navigate({ to: "/login" });
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={close} aria-hidden="true" />}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col bg-[#0F172A] text-slate-300 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-20 shrink-0 items-center justify-between border-b border-[#1F2937] px-6">
          <div className="flex flex-col gap-1">
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

        <DashboardSwitch current="management" onSwitch={close} />

        <nav className="flex-1 overflow-y-auto px-5 pt-6 pb-4">
          <div className="flex items-center justify-between rounded-[12px] px-3.5 py-2.5 text-sm font-medium text-[#D1D5DB]">
            <span className="flex items-center gap-3">
              <img src={safetyIcon} alt="" className="size-5 shrink-0 object-contain" />
              Safety
            </span>
            <ChevronDown className="size-4 shrink-0 text-[#9CA3AF]" />
          </div>
          <ul className="flex flex-col">
            {ITEMS.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={close}
                  className={cn(
                    "flex h-8 items-center rounded-[6px] pl-8 text-[13px] font-semibold text-[#D1D5DB] transition-colors hover:bg-white/5 hover:text-white",
                    active === item.to && "bg-[#2563EB] text-white hover:bg-[#2563EB]",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-[#1F2937] p-4">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-md p-1 text-left transition-colors hover:bg-white/5">
              <Avatar className="size-10 bg-[#1E3A8A]">
                {user?.image_url && <AvatarImage src={user.image_url} alt={user.name} />}
                <AvatarFallback className="bg-[#1E3A8A] text-base font-bold text-white">{initials(user?.name ?? "User")}</AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="truncate text-sm font-bold text-white">{user?.name ?? " "}</p>
                <p className="truncate text-xs text-[#DDDDDD]">{hasBothDashboards(user) ? "Administrator · Management" : "Management"}</p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-[#9CA3AF]" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="min-w-48">
              <DropdownMenuItem onClick={() => void handleSignOut()} className="gap-2 text-red-600 focus:text-red-600">
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
