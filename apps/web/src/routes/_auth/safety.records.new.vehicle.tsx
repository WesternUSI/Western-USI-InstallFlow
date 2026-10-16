import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FieldRow, FormCard, SelectInput, TextInput } from "@/components/whs/safety-form";
import { Notice, SafetyButton, SafetyPage } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";
import { MONTH_CHOICES } from "@/lib/kit-checks";
import { formatIsoDate } from "@/lib/upload-file";
import { useResponsiblePeople } from "@/lib/use-people";
import { addMonthsIso } from "@/lib/whs-sample";

export const Route = createFileRoute("/_auth/safety/records/new/vehicle")({
  component: AddVehicle,
});

type Errors = Partial<Record<"rego" | "model" | "year" | "regoExpiry" | "insuranceExpiry" | "lastService" | "interval", string>>;

/** F5 Add Vehicle, real (framework 4E; Western USI only, VH4). The next service is worked out. */
function AddVehicle() {
  const navigate = useNavigate();
  const create = useMutation(api.vehicles.adminCreate);
  const people = useResponsiblePeople();
  const [rego, setRego] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [vin, setVin] = useState("");
  const [regoExpiry, setRegoExpiry] = useState("");
  const [insuranceExpiry, setInsuranceExpiry] = useState("");
  const [lastService, setLastService] = useState("");
  const [interval, setInterval] = useState("6");
  const [provider, setProvider] = useState("");
  const [responsible, setResponsible] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const next = lastService && interval ? addMonthsIso(lastService, Number(interval)) : "";

  const save = async () => {
    const found: Errors = {};
    if (rego.trim() === "") found.rego = "Enter the registration number.";
    if (model.trim() === "") found.model = "Enter the make and model.";
    if (year !== "" && !/^(19|20)\d\d$/.test(year)) found.year = "Enter a four-digit year, e.g. 2021.";
    if (regoExpiry === "") found.regoExpiry = "Select the registration expiry date.";
    if (insuranceExpiry === "") found.insuranceExpiry = "Select the insurance expiry date.";
    if (lastService === "") found.lastService = "Select the last service date.";
    else if (lastService > new Date().toISOString().slice(0, 10)) found.lastService = "The last service date can't be in the future.";
    if (interval === "") found.interval = "Select the service interval.";
    setErrors(found);
    const first = Object.values(found)[0];
    if (first) {
      toast.error(first);
      return;
    }
    setSaving(true);
    try {
      const vehicleId = await create({
        registration: rego.trim(),
        make_model: model.trim(),
        year: year === "" ? undefined : Number(year),
        vin: vin.trim() || undefined,
        registration_expiry: regoExpiry,
        insurance_expiry: insuranceExpiry,
        last_service: lastService,
        service_interval_months: Number(interval),
        service_provider: provider.trim() || undefined,
        responsible_user_id: responsible === "" ? undefined : (responsible as Id<"users">),
      });
      toast.success(`${rego.trim().toUpperCase()} saved`);
      void navigate({ replace: true, to: "/safety/vehicles/$vehicleId", params: { vehicleId } });
    } catch (caught) {
      toast.error(toUserMessage(caught, "Could not save that vehicle."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafetyPage title="Add Vehicle" description="Record registration, insurance and the recurring service schedule." back={{ to: "/safety/vehicles", label: "Vehicle Register" }}>
      <FormCard title="Record details">
        <FieldRow>
          <Field label="Registration" required error={errors.rego}>
            <TextInput value={rego} onChange={setRego} placeholder="e.g. 1HXR552" invalid={!!errors.rego} />
          </Field>
          <Field label="Make / model" required error={errors.model}>
            <TextInput value={model} onChange={setModel} placeholder="e.g. Toyota HiAce" invalid={!!errors.model} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Year" error={errors.year}>
            <TextInput value={year} onChange={setYear} placeholder="e.g. 2021" invalid={!!errors.year} />
          </Field>
          <Field label="VIN">
            <TextInput value={vin} onChange={setVin} placeholder="Enter VIN" />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Registration expiry" required error={errors.regoExpiry}>
            <TextInput type="date" value={regoExpiry} onChange={setRegoExpiry} invalid={!!errors.regoExpiry} />
          </Field>
          <Field label="Insurance expiry" required error={errors.insuranceExpiry}>
            <TextInput type="date" value={insuranceExpiry} onChange={setInsuranceExpiry} invalid={!!errors.insuranceExpiry} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Last service date" required error={errors.lastService}>
            <TextInput type="date" value={lastService} onChange={setLastService} invalid={!!errors.lastService} />
          </Field>
          <Field label="Service interval" required error={errors.interval}>
            <SelectInput value={interval} onChange={setInterval} options={MONTH_CHOICES} invalid={!!errors.interval} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Next service (calculated)">
            <div className="flex h-11 items-center rounded-[6px] border border-[#e5e7eb] bg-[#f8fafc] px-3 text-sm text-[#475569]">{next ? formatIsoDate(next) : "Worked out from the last service"}</div>
          </Field>
          <Field label="Service provider">
            <TextInput value={provider} onChange={setProvider} placeholder="Enter provider" />
          </Field>
        </FieldRow>
        <Field label="Responsible person" className="sm:max-w-[calc(50%-10px)]">
          <SelectInput value={responsible} onChange={setResponsible} options={people} placeholder="The admin list" />
        </Field>
        <Notice tone="info">Reminders: registration and insurance 60, 30, 14 and 7 days before expiry; service 30, 14 and 7 days before it's due.</Notice>
        <div className="flex flex-wrap gap-3">
          <SafetyButton variant="secondary" to="/safety/records/new">
            Cancel
          </SafetyButton>
          <SafetyButton onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save Vehicle"}
          </SafetyButton>
        </div>
      </FormCard>
    </SafetyPage>
  );
}
