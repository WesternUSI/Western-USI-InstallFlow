import { api } from "@usi-installer/backend/convex/_generated/api";
import type { Id } from "@usi-installer/backend/convex/_generated/dataModel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FormCard, TextArea } from "@/components/whs/safety-form";
import { Notice, Panel, SafetyButton, SafetyPage } from "@/components/whs/safety-ui";
import { toUserMessage } from "@/lib/errors";

export const Route = createFileRoute("/_auth/safety/vehicles/$vehicleId/availability")({
  component: VehicleAvailability,
});

/** D4 Vehicle Availability, real: set Out of service (framework 6) or return to service, with a reason. */
function VehicleAvailability() {
  const { vehicleId } = Route.useParams();
  const vehicle = useQuery(api.vehicles.adminDetail, { vehicle_id: vehicleId });
  const setAvailability = useMutation(api.vehicles.adminSetAvailability);
  const navigate = useNavigate();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  if (vehicle === undefined || vehicle === null) {
    return (
      <SafetyPage title="Vehicle Availability" description="" back={{ to: "/safety/vehicles", label: "Vehicle Register" }}>
        <Panel className="p-6 text-sm text-[#64748b]">{vehicle === undefined ? "Loading…" : "This vehicle could not be found."}</Panel>
      </SafetyPage>
    );
  }
  const takingOut = !vehicle.out_of_service;

  const save = async () => {
    if (reason.trim() === "") {
      setError(takingOut ? "Enter why the vehicle is out of service." : "Enter why the vehicle can return to service.");
      toast.error(takingOut ? "Enter why the vehicle is out of service." : "Enter why the vehicle can return to service.");
      return;
    }
    setSaving(true);
    try {
      await setAvailability({ vehicle_id: vehicleId as Id<"vehicles">, out_of_service: takingOut, reason: reason.trim() });
      toast.success(takingOut ? `${vehicle.registration} set out of service` : `${vehicle.registration} returned to service`);
      void navigate({ replace: true, to: "/safety/vehicles/$vehicleId", params: { vehicleId } });
    } catch (caught) {
      toast.error(toUserMessage(caught, "Could not save that."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafetyPage title="Vehicle Availability" description={`${vehicle.registration} · ${vehicle.make_model}`} back={{ to: "/safety/vehicles/$vehicleId", label: "Vehicle details", params: { vehicleId } }}>
      <FormCard title={takingOut ? "Set out of service" : "Return to service"}>
        <Field label="Reason" required error={error}>
          <TextArea
            value={reason}
            onChange={(value) => {
              setReason(value);
              setError(undefined);
            }}
            placeholder={takingOut ? "e.g. Mechanical issue — repairs pending" : "e.g. Repairs completed, inspected by Osborne Park Auto"}
            invalid={!!error}
          />
        </Field>
        <Notice tone="info">
          {takingOut
            ? "Out-of-service vehicles show in the dashboard's Out of service card and aren't chased for reminders."
            : "Check the registration, insurance and servicing are in order before returning it to service."}
        </Notice>
        <div className="flex flex-wrap gap-3">
          <SafetyButton variant="secondary" to="/safety/vehicles/$vehicleId" params={{ vehicleId }}>
            Cancel
          </SafetyButton>
          <SafetyButton onClick={() => void save()} disabled={saving} className={takingOut ? "bg-[#dc2626] hover:bg-[#b91c1c]" : undefined}>
            {saving ? "Saving…" : takingOut ? "Set Out of Service" : "Return to Service"}
          </SafetyButton>
        </div>
      </FormCard>
    </SafetyPage>
  );
}
