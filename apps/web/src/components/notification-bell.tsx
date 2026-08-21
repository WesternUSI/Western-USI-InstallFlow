import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@usi-installer/ui/components/dropdown-menu";
import { useMutation, useQuery } from "convex/react";
import { Bell, CheckCheck, PackageCheck } from "lucide-react";

/** "2m ago" / "3h ago" / "5d ago" — falls back to a short date past a week. */
function timeAgo(ms: number): string {
  const minutes = Math.floor((Date.now() - ms) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Notification bell shared by every admin screen via `PageHeader`. One
 * shared inbox, backed by `notifications.list` — see `workorders.
 * completeWorkOrder`, the only thing that writes to it today. */
export function NotificationBell() {
  const notifications = useQuery(api.notifications.list);
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);

  const unreadCount = notifications?.filter((notification) => !notification.read).length ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Notifications"
        className="relative size-10 shrink-0 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
      >
        <Bell className="size-6" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-96 min-w-96 rounded-xl border border-slate-200 bg-white p-0 shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-900">Notifications</h2>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead({})}
              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              <CheckCheck className="size-3.5" />
              Mark all as read
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {notifications === undefined && (
            <p className="px-4 py-8 text-center text-sm text-slate-400">Loading…</p>
          )}
          {notifications !== undefined && notifications.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-slate-400">No notifications yet.</p>
          )}
          {notifications?.map((notification) => (
            <button
              key={notification._id}
              type="button"
              onClick={() => {
                if (!notification.read) void markRead({ id: notification._id as Id<"notifications"> });
              }}
              className={`flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left transition-colors last:border-0 hover:bg-slate-50 ${
                notification.read ? "" : "bg-blue-50/60"
              }`}
            >
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
                <PackageCheck className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span
                    className={`truncate text-sm ${notification.read ? "font-medium text-slate-700" : "font-bold text-slate-900"}`}
                  >
                    {notification.title}
                  </span>
                  {!notification.read && <span className="size-1.5 shrink-0 rounded-full bg-blue-500" />}
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">{notification.body}</span>
                <span className="mt-0.5 block text-[11px] text-slate-400">
                  {timeAgo(notification.created_at)}
                </span>
              </span>
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
