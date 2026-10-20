import { api } from "@usi-installer/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { ACTIVITY_TEXT, ActivityPanel, MgmtPage, ReminderScheduleCard } from "@/components/whs/management";
import { DetailsLayout, EvidencePreview, SideButton, SideCard } from "@/components/whs/record-cards";
import { DetailGrid, Notice, Panel, StatusBadge } from "@/components/whs/safety-ui";
import { formatIsoDate } from "@/lib/upload-file";
import { vehicleBadge } from "@/lib/vehicle-status";

export const Route = createFileRoute("/_management/management/vehicles/$vehicleId")({
  component: VehicleForManagement,
});

/** M16 A vehicle for management (framework 4E, decision AD43). Read-only: services and availability stay with the office. */
function VehicleForManagement() {
  const { vehicleId } = Route.useParams();
  const vehicle = useQuery(api.vehicles.adminDetail, { vehicle_id: vehicleId });
  const back = { to: "/management/exceptions", label: "Exceptions" };

  if (vehicle === undefined || vehicle === null) {
    return (
      <MgmtPage title="Vehicle" back={back}>
        <Panel className="p-6 text-sm text-[#64748b]">{vehicle === undefined ? "Loading…" : "This vehicle could not be found."}</Panel>
      </MgmtPage>
    );
  }
  const needsFollowUp = vehicle.status !== "current";

  return (
    <MgmtPage title={`${vehicle.registration} · ${vehicle.make_model}${vehicle.year ? ` ${vehicle.year}` : ""}`} description="Management · Western USI · Vehicle record" back={back}>
      {vehicle.archived ? <Notice tone="warning">This vehicle is archived. It is kept with its history but no longer used.</Notice> : null}
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
                  { label: "Registration expires", value: formatIsoDate(vehicle.registration_expiry) },
                  { label: "Service interval", value: `${vehicle.service_interval_months} months` },
                  { label: "Next service", value: formatIsoDate(vehicle.next_service) },
                  { label: "Service provider", value: vehicle.service_provider ?? "—" },
                  { label: "Responsible person", value: vehicle.responsible ?? "The admin list" },
                  { label: "Insurance expires", value: formatIsoDate(vehicle.insurance_expiry) },
                  { label: "Last service", value: formatIsoDate(vehicle.last_service) },
                ]}
              />
            </Panel>
            {vehicle.out_of_service ? <Notice tone="danger">Out of service: {vehicle.out_of_service_reason}</Notice> : null}
            {needsFollowUp ? (
              <Panel className="flex flex-col gap-3 p-6">
                <h3 className="text-base font-semibold text-[#111827]">Operations follow-up</h3>
                <p className="text-[13px] text-[#64748b]">
                  {vehicle.status_label}. Contact {vehicle.responsible ?? "an administrator"} to arrange it. Services and vehicle changes stay with the office.
                </p>
              </Panel>
            ) : null}
            <ActivityPanel
              lines={vehicle.activity.map((entry) => ({ at: entry.at, text: ACTIVITY_TEXT[entry.action] ?? entry.action, by: entry.by, details: entry.details }))}
            />
          </>
        }
        side={
          <>
            <SideCard title="Evidence">
              <EvidencePreview fileName={vehicle.latest_file?.name ?? "No service report"} />
              {vehicle.latest_file?.url ? (
                <SideButton filled onClick={() => window.open(vehicle.latest_file?.url ?? "", "_blank", "noopener")}>
                  Open Document
                </SideButton>
              ) : null}
            </SideCard>
            <ReminderScheduleCard text="Service 30, 14 and 7 days before it's due; registration and insurance 60, 30, 14 and 7 days before expiry" />
          </>
        }
      />
    </MgmtPage>
  );
}
