import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FieldRow, FormCard, SelectInput, TextInput } from "@/components/whs/safety-form";
import { Notice, SafetyButton, SafetyPage } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";
import { KIT_TYPES, MONTH_CHOICES } from "@/lib/kit-checks";
import { useInspectors } from "@/lib/use-people";

export const Route = createFileRoute("/_auth/safety/records/new/kit")({
  component: AddFirstAidKit,
});

type Errors = Partial<Record<"code" | "type" | "location" | "installer" | "interval" | "next", string>>;

/** F6 Add First-Aid Kit, real (framework 4F; K2 3-month default; K4 the assigned installer inspects it). */
function AddFirstAidKit() {
  const navigate = useNavigate();
  const create = useMutation(api.kits.adminCreate);
  const inspectors = useInspectors();
  const [code, setCode] = useState("");
  const [type, setType] = useState("Vehicle kit");
  const [location, setLocation] = useState("");
  const [installer, setInstaller] = useState("");
  const [interval, setInterval] = useState("3");
  const [next, setNext] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const found: Errors = {};
    if (code.trim() === "") found.code = "Enter the kit ID, e.g. V-12.";
    if (type === "") found.type = "Select the kit type.";
    if (location.trim() === "") found.location = "Enter where the kit is kept, or its vehicle.";
    if (installer === "") found.installer = "Select the installer who inspects this kit.";
    if (interval === "") found.interval = "Select how often the kit is inspected.";
    if (next === "") found.next = "Select when the first inspection is due.";
    setErrors(found);
    const first = Object.values(found)[0];
    if (first) {
      toast.error(first);
      return;
    }
    setSaving(true);
    try {
      const kitId = await create({
        code: code.trim(),
        kit_type: type,
        location: location.trim(),
        responsible_user_id: installer as Id<"users">,
        frequency_months: Number(interval),
        next_inspection: next,
        notes: notes.trim() || undefined,
      });
      toast.success(`Kit ${code.trim()} saved`);
      void navigate({ replace: true, to: "/safety/kits/$kitId", params: { kitId } });
    } catch (caught) {
      toast.error(toUserMessage(caught, "Could not save that kit."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafetyPage title="Add First-Aid Kit" description="Create a kit record and assign an installer to inspect it." back={{ to: "/safety/kits", label: "First-Aid Kits" }}>
      <FormCard title="Record details">
        <FieldRow>
          <Field label="Kit ID" required error={errors.code}>
            <TextInput value={code} onChange={setCode} placeholder="e.g. V-12" invalid={!!errors.code} />
          </Field>
          <Field label="Kit type" required error={errors.type}>
            <SelectInput value={type} onChange={setType} options={KIT_TYPES} invalid={!!errors.type} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Location or assigned vehicle" required error={errors.location}>
            <TextInput value={location} onChange={setLocation} placeholder="e.g. Vehicle 1DXK442" invalid={!!errors.location} />
          </Field>
          <Field label="Assigned installer" required error={errors.installer}>
            <SelectInput value={installer} onChange={setInstaller} options={inspectors} invalid={!!errors.installer} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Inspection interval" required error={errors.interval}>
            <SelectInput value={interval} onChange={setInterval} options={MONTH_CHOICES} invalid={!!errors.interval} />
          </Field>
          <Field label="First inspection due" required error={errors.next}>
            <TextInput type="date" value={next} onChange={setNext} invalid={!!errors.next} />
          </Field>
        </FieldRow>
        <Field label="Notes">
          <TextInput value={notes} onChange={setNotes} placeholder="Optional" />
        </Field>
        <Notice tone="info">Inspection reminders go out 14 and 7 days before due. The installer completes the checklist on their phone; the next date is worked out when they submit.</Notice>
        <div className="flex flex-wrap gap-3">
          <SafetyButton variant="secondary" to="/safety/records/new">
            Cancel
          </SafetyButton>
          <SafetyButton onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save Kit"}
          </SafetyButton>
        </div>
      </FormCard>
    </SafetyPage>
  );
}
