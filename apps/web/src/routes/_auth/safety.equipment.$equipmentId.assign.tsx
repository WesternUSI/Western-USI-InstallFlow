import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FieldRow, FormCard, SelectInput, TextInput } from "@/components/whs/safety-form";
import { Notice, Panel, SafetyButton, SafetyPage } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";
import { useInspectors } from "@/lib/use-people";

export const Route = createFileRoute("/_auth/safety/equipment/$equipmentId/assign")({
  component: AssignEquipmentCheck,
});

/** Assign a one-off check of an item to a worker, to do by a date (decision AD49). */
function AssignEquipmentCheck() {
  const { equipmentId } = Route.useParams();
  const item = useQuery(api.equipment.adminDetail, { equipment_id: equipmentId });
  const assign = useMutation(api.equipment.adminAssign);
  const workers = useInspectors();
  const navigate = useNavigate();
  const [company, setCompany] = useState<string | null>(null);
  const [worker, setWorker] = useState<string | null>(null);
  const [due, setDue] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ company?: string; worker?: string; due?: string }>({});
  const [saving, setSaving] = useState(false);

  if (item === undefined || item === null) {
    return (
      <SafetyPage title="Assign Check" description="" back={{ to: "/safety/equipment", label: "Height & Safety Equipment" }}>
        <Panel className="p-6 text-sm text-[#64748b]">{item === undefined ? "Loading…" : "This item could not be found."}</Panel>
      </SafetyPage>
    );
  }
  const label = [item.name, item.brand, item.type].filter(Boolean).join(" · ");
  const assigned = workers.find((entry) => entry.value === item.open_check?.assigned_to_id);
  const companyValue = company ?? assigned?.company ?? "";
  const workerValue = worker ?? (company === null ? assigned?.value : undefined) ?? "";
  const dueValue = due ?? item.open_check?.due ?? "";
  // Western USI first, then subcontractors A-Z.
  const companies = [...new Set(workers.map((entry) => entry.company))]
    .sort((a, b) => (a === "Western USI" ? -1 : b === "Western USI" ? 1 : a.localeCompare(b)))
    .map((value) => ({ value, label: value }));
  const companyWorkers = workers.filter((entry) => entry.company === companyValue).map((entry) => ({ value: entry.value, label: entry.name }));

  const save = async () => {
    const found: typeof errors = {};
    if (companyValue === "") found.company = "Select the company.";
    if (workerValue === "") found.worker = "Select the worker who does the check.";
    if (dueValue === "") found.due = "Select the date the check is due by.";
    setErrors(found);
    const first = Object.values(found)[0];
    if (first) {
      toast.error(first);
      return;
    }
    setSaving(true);
    try {
      await assign({ equipment_id: equipmentId as Id<"equipment">, user_id: workerValue as Id<"users">, due: dueValue });
      toast.success("Check assigned");
      void navigate({ replace: true, to: "/safety/equipment/$equipmentId", params: { equipmentId } });
    } catch (caught) {
      toast.error(toUserMessage(caught, "Could not assign that check."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafetyPage title="Assign Check" description={label} back={{ to: "/safety/equipment/$equipmentId", label: "Item details", params: { equipmentId } }}>
      <FormCard title="Check details">
        {item.open_check ? (
          <Notice tone="info">
            {item.open_check.assigned_to} already has this check. Saving changes who does it and when; there is only one open check per item.
          </Notice>
        ) : null}
        <FieldRow>
          <Field label="Company" required error={errors.company}>
            <SelectInput
              value={companyValue}
              onChange={(value) => {
                setCompany(value);
                setWorker("");
                setErrors((current) => ({ ...current, company: undefined }));
              }}
              options={companies}
              invalid={!!errors.company}
            />
          </Field>
          <Field label="Worker" required error={errors.worker}>
            <SelectInput
              value={workerValue}
              onChange={(value) => {
                setWorker(value);
                setErrors((current) => ({ ...current, worker: undefined }));
              }}
              options={companyWorkers}
              placeholder={companyValue === "" ? "Choose the company first" : "Select…"}
              invalid={!!errors.worker}
            />
          </Field>
        </FieldRow>
        <Field label="Check by" required error={errors.due}>
          <TextInput type="date" value={dueValue} onChange={setDue} invalid={!!errors.due} />
        </Field>
        <Notice tone="info">The worker does the check once on their phone. It shows as Overdue after the check-by date.</Notice>
        <div className="flex flex-wrap gap-3">
          <SafetyButton variant="secondary" to="/safety/equipment/$equipmentId" params={{ equipmentId }}>
            Cancel
          </SafetyButton>
          <SafetyButton onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Assign Check"}
          </SafetyButton>
        </div>
      </FormCard>
    </SafetyPage>
  );
}
