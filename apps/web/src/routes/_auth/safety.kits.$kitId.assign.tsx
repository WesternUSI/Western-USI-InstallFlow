import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FieldRow, FormCard, SelectInput, TextInput } from "@/components/whs/safety-form";
import { Notice, Panel, SafetyButton, SafetyPage } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";
import { MONTH_CHOICES } from "@/lib/kit-checks";
import { useInspectors } from "@/lib/use-people";

export const Route = createFileRoute("/_auth/safety/kits/$kitId/assign")({
  component: AssignKitInspection,
});

/** FA4 Assign Kit Inspection, real: who inspects it (K4), when it's due and how often (K2). */
function AssignKitInspection() {
  const { kitId } = Route.useParams();
  const kit = useQuery(api.kits.adminDetail, { kit_id: kitId });
  const assign = useMutation(api.kits.adminAssign);
  const inspectors = useInspectors();
  const navigate = useNavigate();
  const [installer, setInstaller] = useState<string | null>(null);
  const [due, setDue] = useState<string | null>(null);
  const [interval, setInterval] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ installer?: string; due?: string; interval?: string }>({});
  const [saving, setSaving] = useState(false);

  if (kit === undefined || kit === null) {
    return (
      <SafetyPage title="Assign Kit Inspection" description="" back={{ to: "/safety/kits", label: "First-Aid Kits" }}>
        <Panel className="p-6 text-sm text-[#64748b]">{kit === undefined ? "Loading…" : "This kit could not be found."}</Panel>
      </SafetyPage>
    );
  }
  const installerValue = installer ?? (kit.responsible_id as string | undefined) ?? "";
  const dueValue = due ?? kit.next_inspection;
  const intervalValue = interval ?? String(kit.frequency_months);

  const save = async () => {
    const found: typeof errors = {};
    if (installerValue === "") found.installer = "Select the installer who inspects this kit.";
    if (dueValue === "") found.due = "Select when the inspection is due.";
    if (intervalValue === "") found.interval = "Select how often the kit is inspected.";
    setErrors(found);
    const first = Object.values(found)[0];
    if (first) {
      toast.error(first);
      return;
    }
    setSaving(true);
    try {
      await assign({
        kit_id: kitId as Id<"first_aid_kits">,
        responsible_user_id: installerValue as Id<"users">,
        next_inspection: dueValue,
        frequency_months: Number(intervalValue),
      });
      toast.success("Inspection assigned");
      void navigate({ replace: true, to: "/safety/kits/$kitId", params: { kitId } });
    } catch (caught) {
      toast.error(toUserMessage(caught, "Could not assign that inspection."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafetyPage title="Assign Kit Inspection" description={`Kit ${kit.code} · ${kit.location}`} back={{ to: "/safety/kits/$kitId", label: "Kit details", params: { kitId } }}>
      <FormCard title="Inspection details">
        <FieldRow>
          <Field label="Kit">
            <TextInput value={`${kit.code} · ${kit.location}`} onChange={() => undefined} />
          </Field>
          <Field label="Assigned installer" required error={errors.installer}>
            <SelectInput value={installerValue} onChange={setInstaller} options={inspectors} invalid={!!errors.installer} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Due date" required error={errors.due}>
            <TextInput type="date" value={dueValue} onChange={setDue} invalid={!!errors.due} />
          </Field>
          <Field label="Repeat interval" required error={errors.interval}>
            <SelectInput value={intervalValue} onChange={setInterval} options={MONTH_CHOICES} invalid={!!errors.interval} />
          </Field>
        </FieldRow>
        <Notice tone="info">The installer completes the inspection on their phone. Reminders go out 14 and 7 days before it's due.</Notice>
        <div className="flex flex-wrap gap-3">
          <SafetyButton variant="secondary" to="/safety/kits/$kitId" params={{ kitId }}>
            Cancel
          </SafetyButton>
          <SafetyButton onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Assign Inspection"}
          </SafetyButton>
        </div>
      </FormCard>
    </SafetyPage>
  );
}
