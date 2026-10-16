import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { toast } from "sonner";

import { DetailsLayout, EvidencePreview, SideButton, SideCard } from "@/components/whs/record-cards";
import { ArchivedNotice, EditRecordDialog, ManageRecordCard } from "@/components/whs/record-admin";
import { Field, FieldRow, SelectInput, TextArea, TextInput } from "@/components/whs/safety-form";
import { DetailGrid, Notice, Panel, SafetyButton, SafetyPage, StatusBadge, reminderText } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";
import { MONTH_CHOICES } from "@/lib/kit-checks";
import { formatIsoDate, formatTime } from "@/lib/upload-file";
import { useResponsiblePeople } from "@/lib/use-people";
import { vehicleBadge } from "@/lib/vehicle-status";

export const Route = createFileRoute("/_auth/safety/vehicles/$vehicleId/")({
  component: VehicleDetails,
});

const ACTION_TEXT: Record<string, string> = {
  added: "Vehicle added",
  serviced: "Service recorded",
  out_of_service: "Set out of service",
  returned_to_service: "Returned to service",
  reminder_sent: "Reminder sent",
  escalated: "Escalated to management",
  edited: "Details changed",
  archived: "Archived",
};

/** D2 Vehicle Details, real (framework 4E), with the Out of Service variant. */
function VehicleDetails() {
  const { vehicleId } = Route.useParams();
  const vehicle = useQuery(api.vehicles.adminDetail, { vehicle_id: vehicleId });
  const archive = useMutation(api.vehicles.adminArchive);
  const [editing, setEditing] = useState(false);

  if (vehicle === undefined || vehicle === null) {
    return (
      <SafetyPage title="Vehicle" description="" back={{ to: "/safety/vehicles", label: "Vehicle Register" }}>
        <Panel className="p-6 text-sm text-[#64748b]">{vehicle === undefined ? "Loading…" : "This vehicle could not be found."}</Panel>
      </SafetyPage>
    );
  }

  return (
    <SafetyPage title={`${vehicle.registration} · ${vehicle.make_model}`} description="Western USI vehicle" back={{ to: "/safety/vehicles", label: "Vehicle Register" }}>
      {vehicle.archived ? <ArchivedNotice noun="vehicle" /> : null}
      <DetailsLayout
        main={
          <>
            <Panel className="flex flex-col gap-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold text-[#111827]">Vehicle details</h2>
                <StatusBadge status={vehicleBadge(vehicle.status)} label={vehicle.status_label} />
              </div>
              <DetailGrid
                columns={2}
                items={[
                  { label: "VIN", value: vehicle.vin ?? "—" },
                  { label: "Year", value: vehicle.year ?? "—" },
                  { label: "Registration expires", value: formatIsoDate(vehicle.registration_expiry) },
                  { label: "Insurance expires", value: formatIsoDate(vehicle.insurance_expiry) },
                  { label: "Last service", value: formatIsoDate(vehicle.last_service) },
                  { label: "Next service", value: formatIsoDate(vehicle.next_service) },
                  { label: "Service interval", value: `${vehicle.service_interval_months} months` },
                  { label: "Service provider", value: vehicle.service_provider ?? "—" },
                  { label: "Responsible person", value: vehicle.responsible ?? "The admin list" },
                  { label: "Reminders", value: `Service ${reminderText([30, 14, 7], "it's due")}; registration and insurance 60, 30, 14 and 7 days before expiry` },
                ]}
              />
            </Panel>
            {vehicle.out_of_service ? <Notice tone="danger">Out of service: {vehicle.out_of_service_reason}</Notice> : null}
            <Panel className="flex flex-col gap-3 p-6">
              <h3 className="text-base font-semibold text-[#111827]">Service history</h3>
              {vehicle.services.length === 0 ? <p className="text-xs text-[#64748b]">No services recorded in the app yet.</p> : null}
              {vehicle.services.map((service) => (
                <p key={`${service.date}-${service.by}`} className="text-xs text-[#64748b]">
                  {formatIsoDate(service.date)} · {service.provider ?? "—"}
                  {service.odometer ? ` · ${service.odometer}` : ""}
                  {service.notes ? ` · ${service.notes}` : ""} · recorded by {service.by}
                </p>
              ))}
            </Panel>
            <Panel className="flex flex-col gap-4 p-6">
              <h3 className="text-base font-semibold text-[#111827]">Recent activity</h3>
              {vehicle.activity.map((entry) => (
                <p key={`${entry.at}-${entry.action}`} className="text-xs text-[#64748b]">
                  {formatTime(entry.at)} · {ACTION_TEXT[entry.action] ?? entry.action}
                  {entry.by ? ` by ${entry.by}` : ""}
                  {entry.details ? ` · ${entry.details}` : ""}
                </p>
              ))}
            </Panel>
          </>
        }
        side={
          <>
            <SideCard title="Evidence">
              <EvidencePreview fileName={vehicle.latest_file?.name ?? "No service report"} />
              {vehicle.latest_file?.url ? <SideButton onClick={() => window.open(vehicle.latest_file?.url ?? "", "_blank", "noopener")}>Open Report</SideButton> : null}
              {vehicle.can_manage ? (
                <>
                  <SafetyButton to="/safety/vehicles/$vehicleId/service" params={{ vehicleId }} className="w-full rounded-[8px] text-xs">
                    Mark Service Complete
                  </SafetyButton>
                  {/* Out of service ends with "Mark service complete" (framework 8, decision AD38). */}
                  {vehicle.out_of_service ? null : (
                    <SafetyButton
                      to="/safety/vehicles/$vehicleId/availability"
                      params={{ vehicleId }}
                      className="w-full rounded-[8px] bg-[#dc2626] text-xs hover:bg-[#b91c1c]"
                    >
                      Set Out of Service
                    </SafetyButton>
                  )}
                </>
              ) : null}
            </SideCard>
            {vehicle.can_manage ? (
              <ManageRecordCard
                noun="vehicle"
                onEdit={() => setEditing(true)}
                onArchive={async (reason) => {
                  try {
                    await archive({ vehicle_id: vehicle.id, reason });
                    toast.success(`${vehicle.registration} archived`);
                  } catch (error) {
                    toast.error(toUserMessage(error, "Could not archive that vehicle."));
                    throw error;
                  }
                }}
              />
            ) : null}
          </>
        }
      />
      {vehicle.can_manage ? <EditVehicleDialog vehicle={vehicle} open={editing} onClose={() => setEditing(false)} /> : null}
    </SafetyPage>
  );
}

type VehicleDetail = NonNullable<FunctionReturnType<typeof api.vehicles.adminDetail>>;
type VehicleErrors = Partial<Record<"registration" | "model" | "year" | "regoExpiry" | "insuranceExpiry" | "lastService", string>>;

/** Edit Details for a vehicle (decision AD32). The next service is worked out again from the last service and interval. */
function EditVehicleDialog({ vehicle, open, onClose }: { vehicle: VehicleDetail; open: boolean; onClose: () => void }) {
  const edit = useMutation(api.vehicles.adminEdit);
  const people = useResponsiblePeople();
  const initial = () => ({
    registration: vehicle.registration,
    model: vehicle.make_model,
    year: vehicle.year === undefined ? "" : String(vehicle.year),
    vin: vehicle.vin ?? "",
    regoExpiry: vehicle.registration_expiry,
    insuranceExpiry: vehicle.insurance_expiry,
    lastService: vehicle.last_service,
    interval: String(vehicle.service_interval_months),
    provider: vehicle.service_provider ?? "",
    responsible: (vehicle.responsible_id as string | undefined) ?? "",
    notes: vehicle.notes ?? "",
  });
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<VehicleErrors>({});
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(initial());
      setErrors({});
    }
  }
  const set = (key: keyof ReturnType<typeof initial>) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const intervals = MONTH_CHOICES.some((choice) => choice.value === form.interval)
    ? MONTH_CHOICES
    : [...MONTH_CHOICES, { value: form.interval, label: `${form.interval} months` }];

  const save = async (reason: string) => {
    const found: VehicleErrors = {};
    if (form.registration.trim() === "") found.registration = "Enter the registration number";
    if (form.model.trim() === "") found.model = "Enter the make and model";
    if (form.year !== "" && !/^\d{4}$/.test(form.year)) found.year = "Enter a four-digit year, e.g. 2021";
    if (form.regoExpiry === "") found.regoExpiry = "Select the registration expiry";
    if (form.insuranceExpiry === "") found.insuranceExpiry = "Select the insurance expiry";
    if (form.lastService === "") found.lastService = "Select the last service date";
    setErrors(found);
    const first = Object.values(found)[0];
    if (first) {
      toast.error(first);
      return false;
    }
    try {
      await edit({
        vehicle_id: vehicle.id,
        registration: form.registration.trim(),
        make_model: form.model.trim(),
        year: form.year === "" ? undefined : Number(form.year),
        vin: form.vin.trim() || undefined,
        registration_expiry: form.regoExpiry,
        insurance_expiry: form.insuranceExpiry,
        last_service: form.lastService,
        service_interval_months: Number(form.interval),
        service_provider: form.provider.trim() || undefined,
        responsible_user_id: form.responsible === "" ? null : (form.responsible as Id<"users">),
        notes: form.notes.trim() || undefined,
        reason,
      });
      toast.success("Changes saved");
      return true;
    } catch (error) {
      toast.error(toUserMessage(error, "Could not save those changes."));
      return false;
    }
  };

  return (
    <EditRecordDialog open={open} title={`Edit ${vehicle.registration}`} onClose={onClose} onSave={save}>
      <FieldRow>
        <Field label="Registration" required error={errors.registration}>
          <TextInput value={form.registration} onChange={set("registration")} invalid={!!errors.registration} />
        </Field>
        <Field label="Make / model" required error={errors.model}>
          <TextInput value={form.model} onChange={set("model")} invalid={!!errors.model} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Year" error={errors.year}>
          <TextInput value={form.year} onChange={set("year")} invalid={!!errors.year} />
        </Field>
        <Field label="VIN">
          <TextInput value={form.vin} onChange={set("vin")} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Registration expiry" required error={errors.regoExpiry}>
          <TextInput type="date" value={form.regoExpiry} onChange={set("regoExpiry")} invalid={!!errors.regoExpiry} />
        </Field>
        <Field label="Insurance expiry" required error={errors.insuranceExpiry}>
          <TextInput type="date" value={form.insuranceExpiry} onChange={set("insuranceExpiry")} invalid={!!errors.insuranceExpiry} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Last service" required error={errors.lastService}>
          <TextInput type="date" value={form.lastService} onChange={set("lastService")} invalid={!!errors.lastService} />
        </Field>
        <Field label="Service interval" required>
          <SelectInput value={form.interval} onChange={set("interval")} options={intervals} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Service provider">
          <TextInput value={form.provider} onChange={set("provider")} />
        </Field>
        <Field label="Responsible person">
          <SelectInput value={form.responsible} onChange={set("responsible")} options={people} placeholder="The admin list" />
        </Field>
      </FieldRow>
      <Field label="Notes">
        <TextArea value={form.notes} onChange={set("notes")} placeholder="Optional" />
      </Field>
    </EditRecordDialog>
  );
}
