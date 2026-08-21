import type { LucideIcon } from "lucide-react";

export type StatTone = "blue" | "orange" | "green" | "red";

const TONES: Record<StatTone, { icon: string; value: string }> = {
  blue: { icon: "bg-blue-50 text-blue-600", value: "text-blue-600" },
  orange: { icon: "bg-orange-50 text-orange-500", value: "text-orange-500" },
  green: { icon: "bg-green-50 text-green-500", value: "text-green-500" },
  red: { icon: "bg-red-50 text-red-500", value: "text-red-500" },
};

export interface StatTile {
  icon: LucideIcon;
  tone: StatTone;
  label: string;
  value: number | undefined;
  description: string;
}

/**
 * The row of headline numbers shared by the Teams screens. `WorkOrderStats` and
 * `SiteStats` keep their own copies because they also own their queries; this
 * one is handed its values.
 */
export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="grid divide-gray-100 sm:grid-cols-2 sm:divide-x xl:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="flex flex-col px-6 py-4">
            <div className="flex items-center gap-3">
              <span
                className={`flex size-10 items-center justify-center rounded ${TONES[tile.tone].icon}`}
              >
                <tile.icon className="size-5" />
              </span>
              <p className="text-base font-bold text-gray-900">{tile.label}</p>
            </div>
            <p
              className={`mt-2 text-[50px] leading-[60px] font-bold ${TONES[tile.tone].value}`}
            >
              {tile.value ?? "—"}
            </p>
            <p className="text-sm text-gray-500">{tile.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
