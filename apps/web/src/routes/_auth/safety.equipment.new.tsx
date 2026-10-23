import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FieldRow, FormCard, TextArea, TextInput } from "@/components/whs/safety-form";
import { SafetyButton, SafetyPage } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";

export const Route = createFileRoute("/_auth/safety/equipment/new")({
  component: AddEquipment,
});

/** Add one item by hand (decision AD49), with the sheet's columns. */
function AddEquipment() {
  const navigate = useNavigate();
  const create = useMutation(api.equipment.adminCreate);
  const [form, setForm] = useState({ type: "", brand: "", name: "", damage: "Nil", repair: "", outOfService: "" });
  const [errors, setErrors] = useState<{ type?: string; name?: string }>({});
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    const found: typeof errors = {};
    if (form.type.trim() === "") found.type = "Enter the type, e.g. Extension Ladder.";
    if (form.name.trim() === "") found.name = "Enter the name or number, e.g. Step 4.";
    setErrors(found);
    const first = Object.values(found)[0];
    if (first) {
      toast.error(first);
      return;
    }
    setSaving(true);
    try {
      const equipmentId = await create({
        type: form.type,
        brand: form.brand,
        name: form.name,
        damage: form.damage.trim() || undefined,
        repair_history: form.repair.trim() || undefined,
        out_of_service_date: form.outOfService || undefined,
      });
      toast.success(`${form.name.trim()} added`);
      void navigate({ replace: true, to: "/safety/equipment/$equipmentId", params: { equipmentId } });
    } catch (error) {
      toast.error(toUserMessage(error, "Could not add that item."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafetyPage title="Add Equipment" description="Add a ladder or safety step to the list." back={{ to: "/safety/equipment", label: "Height & Safety Equipment" }}>
      <FormCard title="Item details">
        <FieldRow>
          <Field label="Type" required error={errors.type}>
            <TextInput value={form.type} onChange={set("type")} placeholder="e.g. Extension Ladder" invalid={!!errors.type} />
          </Field>
          <Field label="Brand">
            <TextInput value={form.brand} onChange={set("brand")} placeholder="e.g. Gorilla" />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Name / Number" required error={errors.name}>
            <TextInput value={form.name} onChange={set("name")} placeholder="e.g. Step 4" invalid={!!errors.name} />
          </Field>
          <Field label="Damage">
            <TextInput value={form.damage} onChange={set("damage")} placeholder="Nil" />
          </Field>
        </FieldRow>
        <Field label="Repair history">
          <TextArea value={form.repair} onChange={set("repair")} placeholder="Optional" />
        </Field>
        <Field label="Out of service date" hint="Leave empty while the item is in use.">
          <TextInput type="date" value={form.outOfService} onChange={set("outOfService")} />
        </Field>
        <div className="flex flex-wrap gap-3">
          <SafetyButton variant="secondary" to="/safety/equipment">
            Cancel
          </SafetyButton>
          <SafetyButton onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Add Item"}
          </SafetyButton>
        </div>
      </FormCard>
    </SafetyPage>
  );
}
