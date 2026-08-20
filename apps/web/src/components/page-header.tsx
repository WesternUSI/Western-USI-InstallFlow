import { Menu } from "lucide-react";

import { NotificationBell } from "@/components/notification-bell";
import { useSidebar } from "@/lib/sidebar-context";

interface PageHeaderProps {
  title: string;
  description: string;
}

/** Title block shared by every admin screen, with the notification bell. */
export function PageHeader({ title, description }: PageHeaderProps) {
  const { toggle } = useSidebar();

  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:gap-6 sm:px-6 lg:px-8 lg:py-5">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          aria-label="Open menu"
          onClick={toggle}
          className="-ml-1 shrink-0 rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
        >
          <Menu className="size-5" />
        </button>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="truncate text-xl font-bold text-slate-900 lg:text-2xl">{title}</h1>
          <p className="hidden text-sm text-slate-500 sm:block">{description}</p>
        </div>
      </div>

      <NotificationBell />
    </div>
  );
}
