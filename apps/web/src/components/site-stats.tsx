import { api } from "@usi-installer/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { AlertCircle, CheckCircle2, ClipboardList, LayoutGrid } from "lucide-react";

interface TileProps {
  icon: typeof LayoutGrid;
  iconClass: string;
  label: string;
  value: number | undefined;
  valueClass: string;
  description: string;
}

/** Centred tile: icon + label on one line, then the count, then a caption. */
function Tile({ icon: Icon, iconClass, label, value, valueClass, description }: TileProps) {
  return (
    <div className="flex flex-col items-center px-6 py-4">
      <div className="flex items-center gap-3">
        <span className={`flex size-10 items-center justify-center rounded ${iconClass}`}>
          <Icon className="size-5" />
        </span>
        <p className="text-base font-bold text-gray-900">{label}</p>
      </div>
      <p className={`mt-2 text-[50px] leading-[60px] font-bold ${valueClass}`}>{value ?? "—"}</p>
      <p className="text-center text-sm text-gray-500">{description}</p>
    </div>
  );
}

/** The four headline numbers above the Manage Site Data table. */
export function SiteStats() {
  const stats = useQuery(api.sites.stats);

  return (
    <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="grid divide-gray-100 sm:grid-cols-2 sm:divide-x xl:grid-cols-4">
        <Tile
          icon={LayoutGrid}
          iconClass="bg-blue-50 text-blue-600"
          label="Total Sites"
          value={stats?.total}
          valueClass="text-blue-600"
          description="Newly imported sites"
        />
        <Tile
          icon={ClipboardList}
          iconClass="bg-orange-50 text-orange-500"
          label="Incomplete Details"
          value={stats?.incomplete}
          valueClass="text-orange-500"
          description="Some details are missing"
        />
        <Tile
          icon={CheckCircle2}
          iconClass="bg-green-50 text-green-500"
          label="Completed Details"
          value={stats?.completed}
          valueClass="text-green-500"
          description="Successfully completed details"
        />
        <Tile
          icon={AlertCircle}
          iconClass="bg-red-50 text-red-500"
          label="Missing Details"
          value={stats?.missing}
          valueClass="text-red-500"
          description="Empty Details"
        />
      </div>
    </section>
  );
}
