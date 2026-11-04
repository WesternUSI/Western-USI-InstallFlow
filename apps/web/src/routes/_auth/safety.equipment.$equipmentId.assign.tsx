import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { MonthsField, monthsError } from "@/components/whs/months-field";
import { Field, FieldRow, FormCard, TextInput } from "@/components/whs/safety-form";
import { Notice, Panel, SafetyButton, SafetyPage } from "@/components/whs/safety-ui";
import { WorkerChecklist } from "@/components/whs/worker-checklist";
import { toUserMessage } from "@/lib/errors";

export const Route = createFileRoute("/_auth/safety/equipment/$equipmentId/assign")({
  component: AssignEquipmentCheck,
});

/**
 * Add workers to an item's checks, or change theirs (decisions AD49, AD57):
 * each ticked worker gets their own check with this first date and frequency.
 * Workers not ticked keep theirs; they are removed on the item's page.
 */
function AssignEquipmentCheck() {
  const { equipmentId } = Route.useParams();
  const item = useQuery(api.equipment.adminDetail, { equipment_id: equipmentId });
  const assign = useMutation(api.equipment.adminAssign);
  const navigate = useNavigate();
  const [workers, setWorkers] = useState<string[]>([]);
  const [due, setDue] = useState("");
  const [frequency, setFrequency] = useState("3");
  const [errors, setErrors] = useState<{ workers?: string; due?: string; frequency?: string }>({});
  const [saving, setSaving] = useState(false);

  if (item === undefined || item === null) {
    return (
      <SafetyPage title="Schedule Checks" description="" back={{ to: "/safety/equipment", label: "Height & Safety Equipment" }}>
        <Panel className="p-6 text-sm text-[#64748b]">{item === undefined ? "Loading…" : "This item could not be found."}</Panel>
      </SafetyPage>
    );
  }
  const label = [item.name, item.brand, item.type].filter(Boolean).join(" · ");
  const workerValue = workers;
  const dueValue = due;
  const frequencyValue = frequency;
  const every = `${frequencyValue} ${frequencyValue === "1" ? "month" : "months"}`;

  const save = async () => {
    const found: typeof errors = {};
    if (workerValue.length === 0) found.workers = "Tick at least one worker who does the checks.";
    if (dueValue === "") found.due = "Select the date the first check is due by.";
    found.frequency = monthsError(frequencyValue);
    setErrors(found);
    const first = Object.values(found).find(Boolean);
    if (first) {
      toast.error(first);
      return;
    }
    setSaving(true);
    try {
      await assign({
        equipment_id: equipmentId as Id<"equipment">,
        user_ids: workerValue as Id<"users">[],
        due: dueValue,
        frequency_months: Number(frequencyValue),
      });
      toast.success("Checks scheduled");
      void navigate({ replace: true, to: "/safety/equipment/$equipmentId", params: { equipmentId } });
    } catch (caught) {
      toast.error(toUserMessage(caught, "Could not schedule those checks."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafetyPage title="Schedule Checks" description={label} back={{ to: "/safety/equipment/$equipmentId", label: "Item details", params: { equipmentId } }}>
      <FormCard title="Check details">
        {item.open_checks.length > 0 ? (
          <Notice tone="info">
            {`Checked now by ${item.open_checks
              .map((check) => `${check.assigned_to} (every ${check.frequency_months} ${check.frequency_months === 1 ? "month" : "months"})`)
              .join(", ")}.`}{" "}
            They keep their schedules. Ticking one of them here changes their date and frequency; to stop someone checking it, use Remove on the
            item's page.
          </Notice>
        ) : null}
        <WorkerChecklist
          value={workerValue}
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
              value={dueValue}
              onChange={(value) => {
                setDue(value);
                setErrors((current) => ({ ...current, due: undefined }));
              }}
              invalid={!!errors.due}
            />
          </Field>
          <MonthsField
            value={frequencyValue}
            onChange={(value) => {
              setFrequency(value);
              setErrors((current) => ({ ...current, frequency: undefined }));
            }}
            error={errors.frequency}
          />
        </FieldRow>
        <Notice tone="info">
          Each ticked worker does their own check on their phone. When one of them finishes, their next check is set automatically, {every} later.
          Reminders go 14 and 7 days before, then weekly once overdue.
        </Notice>
        <div className="flex flex-wrap gap-3">
          <SafetyButton variant="secondary" to="/safety/equipment/$equipmentId" params={{ equipmentId }}>
            Cancel
          </SafetyButton>
          <SafetyButton onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Schedule Checks"}
          </SafetyButton>
        </div>
      </FormCard>
    </SafetyPage>
  );
}
