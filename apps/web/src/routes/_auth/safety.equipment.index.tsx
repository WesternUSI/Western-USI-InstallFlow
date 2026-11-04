import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@usi-installer/ui/components/dialog";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { FilterSelect } from "@/components/filter-select";
import { Field, FieldRow, TextInput } from "@/components/whs/safety-form";
import { PagedTable, Panel, RowAction, SafetyButton, SafetyPage, SearchBox, StatusBadge, Toolbar, statusLabel, type SafetyStatus } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";
import { MonthsField, monthsError } from "@/components/whs/months-field";
import { WorkerChecklist } from "@/components/whs/worker-checklist";
import { formatIsoDate } from "@/lib/upload-file";
import { useListState } from "@/lib/use-list-state";

export const Route = createFileRoute("/_auth/safety/equipment/")({
  component: Equipment,
});

const ALL = "all";
const STATUSES: SafetyStatus[] = ["current", "due-soon", "overdue", "action-required", "out-of-service"];

/** Height and Safety Equipment (decisions AD49, AD57): the list from Mitch's sheet, each item's next check, and scheduling many at once. */
function Equipment() {
  const items = useQuery(api.equipment.list);
  const list = useListState();
  const query = list.get("q", "");
  const setQuery = (value: string) => list.set("q", value);
  const type = list.get("type", ALL);
  const setType = (value: string) => list.set("type", value);
  const status = list.get("status", ALL);
  const setStatus = (value: string) => list.set("status", value);
  const types = [...new Set((items ?? []).map((item) => item.type))].sort();
  const needle = query.trim().toLowerCase();
  const rows = (items ?? []).filter(
    (item) =>
      (needle === "" || `${item.name} ${item.brand} ${item.type} ${item.check?.assigned_to ?? ""}`.toLowerCase().includes(needle)) &&
      (type === ALL || item.type === type) &&
      (status === ALL || item.status === status),
  );
  // Items ticked for "Schedule Checks" (decision AD57); out-of-service ones can't be scheduled.
  const [picked, setPicked] = useState<string[]>([]);
  const [scheduling, setScheduling] = useState(false);
  const pickable = rows.filter((row) => row.status !== "out-of-service").map((row) => row.id as string);
  const allPicked = pickable.length > 0 && pickable.every((id) => picked.includes(id));

  return (
    <SafetyPage title="Height & Safety Equipment" description="Ladders and safety steps, and the checks assigned to workers.">
      <Panel>
        <Toolbar>
          <div className="w-full sm:flex-1">
            <SearchBox value={query} onChange={setQuery} placeholder="Search by name, brand, type or worker" />
          </div>
          <FilterSelect label="Type" value={type} onChange={setType} options={[{ value: ALL, label: "All" }, ...types.map((value) => ({ value, label: value }))]} />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: ALL, label: "All" }, ...STATUSES.map((value) => ({ value, label: statusLabel(value) }))]} />
          <SafetyButton variant="secondary" onClick={() => setScheduling(true)} disabled={picked.length === 0} className="h-[38px]">
            Schedule Checks{picked.length > 0 ? ` (${picked.length})` : ""}
          </SafetyButton>
          <SafetyButton variant="secondary" to="/safety/equipment/import" className="h-[38px]">
            Import from Excel
          </SafetyButton>
          <SafetyButton to="/safety/equipment/new" className="h-[38px]">
            + Add Item
          </SafetyButton>
        </Toolbar>
        <div className="flex flex-wrap items-center gap-4 px-6 pb-3 text-xs text-[#64748b]">
          <button
            type="button"
            className="font-medium text-[#2563eb] hover:underline"
            onClick={() => setPicked(allPicked ? picked.filter((id) => !pickable.includes(id)) : [...new Set([...picked, ...pickable])])}
          >
            {allPicked ? "Untick all shown" : "Tick all shown"}
          </button>
          {picked.length > 0 ? (
            <>
              <span>{picked.length} ticked</span>
              <button type="button" className="font-medium text-[#2563eb] hover:underline" onClick={() => setPicked([])}>
                Clear
              </button>
            </>
          ) : (
            <span>Tick items to schedule their checks together.</span>
          )}
        </div>
        <PagedTable
          page={list.page}
          onPage={list.setPage}
          noun="items"
          rows={rows}
          rowKey={(row) => row.id}
          empty={items === undefined ? "Loading…" : "No equipment matches."}
          columns={[
            {
              key: "pick",
              header: "",
              render: (row) =>
                row.status === "out-of-service" ? null : (
                  <input
                    type="checkbox"
                    aria-label={`Tick ${row.name}`}
                    checked={picked.includes(row.id)}
                    onChange={(event) => setPicked(event.target.checked ? [...picked, row.id] : picked.filter((id) => id !== row.id))}
                    className="size-4 accent-[#2563eb]"
                  />
                ),
            },
            {
              key: "item",
              header: "Item",
              render: (row) => (
                <div className="flex flex-col">
                  <span className="text-[#111827]">{row.name}</span>
                  <span className="text-xs font-normal text-[#64748b]">{[row.brand, row.type].filter(Boolean).join(" · ")}</span>
                </div>
              ),
            },
            { key: "damage", header: "Damage", render: (row) => row.damage ?? "—" },
            {
              key: "check",
              header: "Check",
              render: (row) =>
                row.check
                  ? `${row.check.assigned_to} · next by ${formatIsoDate(row.check.due)}`
                  : "Not scheduled",
            },
            { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
            {
              key: "action",
              header: "Action",
              align: "right",
              render: (row) => (
                <RowAction to="/safety/equipment/$equipmentId" params={{ equipmentId: row.id }}>
                  Open
                </RowAction>
              ),
            },
          ]}
        />
      </Panel>
      <ScheduleChecksDialog
        open={scheduling}
        equipmentIds={picked}
        onClose={() => setScheduling(false)}
        onDone={() => {
          setScheduling(false);
          setPicked([]);
        }}
      />
    </SafetyPage>
  );
}

/** Schedules many items' checks at once: the same workers (each with their own check), first check-by date and frequency (decision AD57). */
function ScheduleChecksDialog({
  open,
  equipmentIds,
  onClose,
  onDone,
}: {
  open: boolean;
  equipmentIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const assignMany = useMutation(api.equipment.adminAssignMany);
  const [workers, setWorkers] = useState<string[]>([]);
  const [due, setDue] = useState("");
  const [frequency, setFrequency] = useState("3");
  const [errors, setErrors] = useState<{ workers?: string; due?: string; frequency?: string }>({});
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setWorkers([]);
      setDue("");
      setFrequency("3");
      setErrors({});
    }
  }

  const save = async () => {
    const found: typeof errors = {};
    if (workers.length === 0) found.workers = "Tick at least one worker who does the checks.";
    if (due === "") found.due = "Select the date the first check is due by.";
    found.frequency = monthsError(frequency);
    setErrors(found);
    const first = Object.values(found).find(Boolean);
    if (first) {
      toast.error(first);
      return;
    }
    setSaving(true);
    try {
      const result = await assignMany({
        equipment_ids: equipmentIds as Id<"equipment">[],
        user_ids: workers as Id<"users">[],
        due,
        frequency_months: Number(frequency),
      });
      toast.success(`Checks scheduled for ${result.scheduled} ${result.scheduled === 1 ? "item" : "items"}`, {
        description: result.skipped > 0 ? `${result.skipped} skipped: out of service or archived.` : undefined,
      });
      onDone();
    } catch (caught) {
      toast.error(toUserMessage(caught, "Could not schedule those checks."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="rounded-xl border-slate-200 bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900">
            Schedule checks for {equipmentIds.length} {equipmentIds.length === 1 ? "item" : "items"}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-500">
            Each ticked worker checks every one of these items on their phone, with this frequency, and after each check their next one is set
            automatically. Anyone already checking these items keeps their own schedule; a ticked worker who already checks one gets this date and
            frequency.
          </DialogDescription>
        </DialogHeader>
        <WorkerChecklist
          value={workers}
          onChange={(next) => {
            setWorkers(next);
            setErrors((current) => ({ ...current, workers: undefined }));
          }}
          error={errors.workers}
        />
        <FieldRow>
          <Field label="First check by" required error={errors.due}>
            <TextInput
              type="date"
              value={due}
              onChange={(value) => {
                setDue(value);
                setErrors((current) => ({ ...current, due: undefined }));
              }}
              invalid={!!errors.due}
            />
          </Field>
          <MonthsField
            value={frequency}
            onChange={(value) => {
              setFrequency(value);
              setErrors((current) => ({ ...current, frequency: undefined }));
            }}
            error={errors.frequency}
          />
        </FieldRow>
        <DialogFooter>
          <SafetyButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </SafetyButton>
          <SafetyButton onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Schedule Checks"}
          </SafetyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
