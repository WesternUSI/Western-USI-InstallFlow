import { api } from "@usi-installer/backend/convex/_generated/api";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@usi-installer/ui/lib/utils";
import { useQuery } from "convex/react";

import { type Dashboard, hasBothDashboards, rememberDashboard } from "@/lib/dashboard-mode";

/**
 * "Admin | Management" in the sidebar, for someone with both dashboards
 * (decision AD43). Hidden for everyone else.
 */
export function DashboardSwitch({ current, onSwitch }: { current: Dashboard; onSwitch?: () => void }) {
  const user = useQuery(api.users.currentUser);
  const navigate = useNavigate();
  if (!hasBothDashboards(user)) return null;

  const go = (target: Dashboard) => {
    if (target === current) return;
    rememberDashboard(target);
    onSwitch?.();
    void navigate({ to: target === "admin" ? "/dashboard" : "/management" });
  };
  const option = (target: Dashboard, label: string) => (
    <button
      type="button"
      onClick={() => go(target)}
      aria-pressed={current === target}
      className={cn(
        "flex-1 rounded-[8px] px-3 py-1.5 text-xs font-semibold transition-colors",
        current === target ? "bg-[#2563EB] text-white" : "text-[#D1D5DB] hover:bg-white/5 hover:text-white",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-5 mt-4 flex gap-1 rounded-[10px] border border-[#1F2937] bg-white/[0.03] p-1" role="group" aria-label="Dashboard">
      {option("admin", "Admin")}
      {option("management", "Management")}
    </div>
  );
}
