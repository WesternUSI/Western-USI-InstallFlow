import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FieldRow, FilePicker, FormCard, SelectInput, TextInput } from "@/components/whs/safety-form";
import { Notice, Panel, SafetyButton, SafetyPage } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";
import { MONTH_CHOICES } from "@/lib/kit-checks";
import { formatIsoDate, uploadFile } from "@/lib/upload-file";
import { useResponsiblePeople } from "@/lib/use-people";
import { addMonthsIso } from "@/lib/whs-sample";

export const Route = createFileRoute("/_auth/safety/vehicles/$vehicleId/service")({
  component: MarkVehicleServiced,
});

type Errors = Partial<Record<"date" | "provider" | "interval", string>>;

/** D3 Mark Service Complete, real (framework 8): the next service is worked out and the vehicle is Current again (AD38). */
function MarkVehicleServiced() {
  const { vehicleId } = Route.useParams();
  const vehicle = useQuery(api.vehicles.adminDetail, { vehicle_id: vehicleId });
  const generateUploadUrl = useMutation(api.vehicles.generateUploadUrl);
  const recordService = useMutation(api.vehicles.adminRecordService);
  const people = useResponsiblePeople();
  const navigate = useNavigate();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [provider, setProvider] = useState<string | null>(null);
  const [interval, setInterval] = useState<string | null>(null);
  const [odometer, setOdometer] = useState("");
  const [responsible, setResponsible] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  if (vehicle === undefined || vehicle === null) {
    return (
      <SafetyPage title="Mark Service Complete" description="" back={{ to: "/safety/vehicles", label: "Vehicle Register" }}>
        <Panel className="p-6 text-sm text-[#64748b]">{vehicle === undefined ? "Loading…" : "This vehicle could not be found."}</Panel>
      </SafetyPage>
    );
  }
  const providerValue = provider ?? vehicle.service_provider ?? "";
  const intervalValue = interval ?? String(vehicle.service_interval_months);
  const next = date && intervalValue ? addMonthsIso(date, Number(intervalValue)) : "";

  const save = async () => {
    const found: Errors = {};
    if (date === "") found.date = "Select the date the service was completed.";
    else if (date > new Date().toISOString().slice(0, 10)) found.date = "The service date can't be in the future.";
    if (providerValue.trim() === "") found.provider = "Enter the service provider.";
    if (intervalValue === "") found.interval = "Select the service interval.";
    setErrors(found);
    const first = Object.values(found)[0];
    if (first) {
      toast.error(first);
      return;
    }
    setSaving(true);
    try {
      const fileId = file === null ? undefined : await uploadFile(await generateUploadUrl(), file);
      const result = await recordService({
        vehicle_id: vehicleId as Id<"vehicles">,
        date,
        provider: providerValue.trim(),
        service_interval_months: Number(intervalValue),
        odometer: odometer.trim() || undefined,
        notes: notes.trim() || undefined,
        responsible_user_id: responsible === "" ? undefined : (responsible as Id<"users">),
        file_id: fileId,
        file_name: file?.name,
      });
      toast.success(`${vehicle.registration} service complete`, { description: `Next service due ${formatIsoDate(result.next_service)}.` });
      void navigate({ replace: true, to: "/safety/vehicles/$vehicleId", params: { vehicleId } });
    } catch (caught) {
      toast.error(toUserMessage(caught, "Could not record that service."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafetyPage title="Mark Service Complete" description={`${vehicle.registration} · ${vehicle.make_model}`} back={{ to: "/safety/vehicles/$vehicleId", label: "Vehicle details", params: { vehicleId } }}>
      <FormCard title="Service details">
        <FieldRow>
          <Field label="Service completed" required error={errors.date}>
            <TextInput type="date" value={date} onChange={setDate} invalid={!!errors.date} />
          </Field>
          <Field label="Service provider" required error={errors.provider}>
            <TextInput value={providerValue} onChange={setProvider} invalid={!!errors.provider} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Service interval" required error={errors.interval}>
            <SelectInput value={intervalValue} onChange={setInterval} options={MONTH_CHOICES} invalid={!!errors.interval} />
          </Field>
          <Field label="Next service (calculated)">
            <div className="flex h-11 items-center rounded-[6px] border border-[#e5e7eb] bg-[#f8fafc] px-3 text-sm text-[#475569]">{next ? formatIsoDate(next) : "—"}</div>
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Odometer (optional)">
            <TextInput value={odometer} onChange={setOdometer} placeholder="e.g. 84,200 km" />
          </Field>
          <Field label="Responsible person">
            <SelectInput value={responsible} onChange={setResponsible} options={people} placeholder="Keep as it is" />
          </Field>
        </FieldRow>
        <Field label="Service notes">
          <TextInput value={notes} onChange={setNotes} placeholder="Optional" />
        </Field>
        <FilePicker file={file} onChange={setFile} />
        <Notice tone="info">
          Saving records the service and works out the next one.{vehicle.out_of_service ? " The vehicle is no longer out of service." : ""} Registration and
          insurance are separate.
        </Notice>
        <div className="flex flex-wrap gap-3">
          <SafetyButton variant="secondary" to="/safety/vehicles/$vehicleId" params={{ vehicleId }}>
            Cancel
          </SafetyButton>
          <SafetyButton onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Mark Service Complete"}
          </SafetyButton>
        </div>
      </FormCard>
    </SafetyPage>
  );
}
