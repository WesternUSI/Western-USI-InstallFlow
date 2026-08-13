import { Bell } from "lucide-react";

interface PageHeaderProps {
  title: string;
  description: string;
  /** Unread count on the bell. Hidden when zero. */
  notifications?: number;
}

/** Title block shared by every admin screen, with the notification bell. */
export function PageHeader({ title, description, notifications = 0 }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-slate-200 bg-white px-8 py-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500">{description}</p>
      </div>

      <button
        type="button"
        aria-label="Notifications"
        className="relative size-10 shrink-0 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
      >
        <Bell className="size-6" />
        {notifications > 0 && (
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
            {notifications}
          </span>
        )}
      </button>
    </div>
  );
}
