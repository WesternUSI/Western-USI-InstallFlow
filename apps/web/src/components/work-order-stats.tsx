import { api } from "@usi-installer/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { CheckCircle2, Clock, Inbox, Users } from "lucide-react";

interface StatTileProps {
  icon: typeof Inbox;
  iconClass: string;
  label: string;
  value: number | undefined;
  description: string;
  valueClass: string;
}

function StatTile({
  icon: Icon,
  iconClass,
  label,
  value,
  description,
  valueClass,
}: StatTileProps) {
  return (
    <div className="flex flex-col px-6 py-4">
      <div className="flex items-center gap-3">
        <span className={`flex size-10 items-center justify-center rounded ${iconClass}`}>
          <Icon className="size-5" />
        </span>
        <p className="text-base font-bold text-gray-900">{label}</p>
      </div>
      <p className={`mt-2 text-[50px] leading-[60px] font-bold ${valueClass}`}>{value ?? "—"}</p>
      <p className="text-sm text-gray-500">{description}</p>
    </div>
  );
}

/**
 * The four headline work order counts. The dashboard shows them under a
 * heading; Manage Orders shows the same row without one.
 */
export function WorkOrderStats({ title }: { title?: string }) {
  const stats = useQuery(api.workorders.dashboardStats);

  return (
    <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
      {title && (
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
        </div>
      )}
      <div className="grid divide-gray-100 sm:grid-cols-2 sm:divide-x xl:grid-cols-4">
        <StatTile
          icon={Inbox}
          iconClass="bg-blue-50 text-blue-600"
          label="Imported Orders"
          value={stats?.imported}
          description="Newly imported, not yet allocated"
          valueClass="text-blue-600"
        />
        <StatTile
          icon={Users}
          iconClass="bg-orange-50 text-orange-500"
          label="Allocated Orders"
          value={stats?.allocated}
          description="Allocated to teams for installation"
          valueClass="text-orange-500"
        />
        <StatTile
          icon={CheckCircle2}
          iconClass="bg-green-50 text-green-500"
          label="Completed Orders"
          value={stats?.completed}
          description="Successfully completed installs"
          valueClass="text-green-500"
        />
        <StatTile
          icon={Clock}
          iconClass="bg-red-50 text-red-500"
          label="Pending Orders"
          value={stats?.pending}
          description="Installation in progress"
          valueClass="text-red-500"
        />
      </div>
    </section>
  );
}
