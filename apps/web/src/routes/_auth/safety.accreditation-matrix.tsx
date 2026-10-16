import { createFileRoute, Link } from "@tanstack/react-router";
import { cn } from "@usi-installer/ui/lib/utils";

import { FilterSelect } from "@/components/filter-select";
import { AccreditationViewSwitch, Notice, Panel, SafetyPage, SearchBox, statusLabel, type SafetyStatus } from "@/components/whs/safety-ui";
import { type RegisterRow, useRegister } from "@/lib/use-register";
import { useListState } from "@/lib/use-list-state";

export const Route = createFileRoute("/_auth/safety/accreditation-matrix")({
  component: AccreditationMatrix,
});

const ALL = "all";
const CELL: Partial<Record<SafetyStatus, string>> = {
  current: "bg-[#f0fdf4] text-[#15803d]",
  "due-soon": "bg-[#fffbeb] text-[#c2410c]",
  "awaiting-verification": "bg-[#fffbeb] text-[#c2410c]",
  "renewal-in-progress": "bg-[#eff6ff] text-[#1d4ed8]",
  expired: "bg-[#fef2f2] text-[#dc2626]",
  missing: "bg-[#fef2f2] text-[#dc2626]",
  "action-required": "bg-[#fef2f2] text-[#dc2626]",
};

/**
 * B2 Accreditation Matrix (framework 12), real data: each worker against
 * every accreditation type. N/A = not required for that worker and nothing
 * uploaded. Selecting a status opens its record.
 */
function AccreditationMatrix() {
  const data = useRegister();
  const list = useListState();
  const query = list.get("q", "");
  const setQuery = (value: string) => list.set("q", value);
  const entity = list.get("entity", ALL);
  const setEntity = (value: string) => list.set("entity", value);
  const status = list.get("status", ALL);
  const setStatus = (value: string) => list.set("status", value);

  const accreditations = (data?.rows ?? []).filter((row) => row.category === "accreditation");
  const types = [...new Set(accreditations.map((row) => row.name))].sort();
  const workers = new Map<string, { worker: string; entity: string; cells: Map<string, RegisterRow> }>();
  for (const row of accreditations) {
    const key = `${row.person}|${row.entity}`;
    const entry = workers.get(key) ?? { worker: row.person ?? "—", entity: row.entity, cells: new Map() };
    entry.cells.set(row.name, row);
    workers.set(key, entry);
  }

  const needle = query.trim().toLowerCase();
  const rows = [...workers.values()]
    .filter(
      (row) =>
        (needle === "" || row.worker.toLowerCase().includes(needle)) &&
        (entity === ALL || row.entity === entity) &&
        (status === ALL || [...row.cells.values()].some((cell) => cell.status === status)),
    )
    .sort((a, b) => a.worker.localeCompare(b.worker));

  return (
    <SafetyPage title="Worker Accreditations" description="Compare worker readiness across required cards, licences and inductions.">
      <AccreditationViewSwitch active="matrix" />
      <Notice tone="info">Select a status to open its record. N/A means this accreditation is not required for that worker.</Notice>
      <Panel>
        <div className="flex flex-wrap items-center gap-3 px-4 py-4">
          <div className="w-full sm:flex-1">
            <SearchBox value={query} onChange={setQuery} placeholder="Search workers" />
          </div>
          <FilterSelect label="Entity" value={entity} onChange={setEntity} options={[{ value: ALL, label: "All entities" }, ...(data?.entities ?? []).map((value) => ({ value, label: value }))]} />
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: ALL, label: "All statuses" },
              ...(["current", "due-soon", "expired", "missing", "awaiting-verification", "renewal-in-progress", "action-required"] as SafetyStatus[]).map((value) => ({
                value,
                label: statusLabel(value),
              })),
            ]}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead className="bg-[#f9fafb]">
              <tr>
                <th className="sticky left-0 bg-[#f9fafb] px-4 py-3 text-[10px] font-semibold tracking-[0.5px] text-[#64748b] uppercase">Worker</th>
                {types.map((type) => (
                  <th key={type} className="px-4 py-3 text-[10px] font-semibold tracking-[0.5px] whitespace-nowrap text-[#64748b] uppercase">
                    {type}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.worker}|${row.entity}`} className="border-t border-[#e5e7eb]">
                  <td className="sticky left-0 bg-white px-4 py-4">
                    <p className="text-sm font-medium whitespace-nowrap text-[#111827]">{row.worker}</p>
                    <p className="text-xs whitespace-nowrap text-[#64748b]">{row.entity}</p>
                  </td>
                  {types.map((type) => {
                    const cell = row.cells.get(type);
                    return (
                      <td key={type} className="px-4 py-4">
                        {cell === undefined ? (
                          <span className="text-xs text-[#111827]">N/A</span>
                        ) : (
                          <Link
                            to="/safety/accreditations/$accreditationId"
                            params={{ accreditationId: cell.id }}
                            className={cn("inline-flex rounded-[4px] px-2 py-1 text-[11px] font-medium whitespace-nowrap hover:underline", CELL[cell.status])}
                          >
                            {cell.status === "due-soon" ? "Due soon" : statusLabel(cell.status)}
                          </Link>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr className="border-t border-[#e5e7eb]">
                  <td colSpan={types.length + 1} className="px-4 py-10 text-center text-sm text-[#64748b]">
                    {data === undefined ? "Loading…" : "No workers match."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </SafetyPage>
  );
}
